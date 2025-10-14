// Basic Express backend for Frametry6 chat app (MongoDB + Socket.IO)
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Static uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Multer for file uploads (avatars, message images)
const upload = multer({ dest: uploadsDir, limits: { fileSize: 5 * 1024 * 1024 } });

// JWT helper
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
function signToken(payload) {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
	return jwt.verify(token, JWT_SECRET);
}

// JWT middleware for protected routes
function jwtMiddleware(req, res, next) {
	const auth = req.headers.authorization;
	if (!auth) return res.status(401).json({ error: 'Unauthorized' });
	const token = auth.split(' ')[1];
	try {
		const payload = verifyToken(token);
		req.user = payload;
		return next();
	} catch (err) {
		return res.status(401).json({ error: 'Invalid token' });
	}
}

// Start server and socket.io after DB connect
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

// Manage socket rooms for channels and call signaling
io.on('connection', (socket) => {
	console.log('Socket connected:', socket.id);

	socket.on('join', async ({ channelId, username }) => {
		console.log('Socket join:', channelId, username);
		socket.join(channelId);
		// Broadcast presence
		socket.to(channelId).emit('presence', { type: 'join', username });
		// Send last 20 messages to joining socket
		try {
			const dbi = db.getDb();
			const messages = await dbi.collection('messages')
				.find({ channelId })
				.sort({ timestamp: -1 })
				.limit(20)
				.toArray();
			socket.emit('history', messages.reverse());
		} catch (err) {
			console.error('Error fetching history:', err);
		}
	});

	socket.on('leave', ({ channelId, username }) => {
		console.log('Socket leave:', channelId, username);
		socket.leave(channelId);
		socket.to(channelId).emit('presence', { type: 'leave', username });
	});

	socket.on('message', async (msg) => {
		// msg should include { channelId, sender, text, type, imagePath }
		try {
			const dbi = db.getDb();
			const message = {
				channelId: msg.channelId,
				sender: msg.sender,
				text: msg.text || null,
				type: msg.type || 'text',
				imagePath: msg.imagePath || null,
				timestamp: new Date()
			};
			const r = await dbi.collection('messages').insertOne(message);
			message._id = r.insertedId;
			io.to(msg.channelId).emit('message', message);
		} catch (err) {
			console.error('Error saving message:', err);
		}
	});

	// Signaling events for WebRTC
	socket.on('call:join', ({ roomId, username }) => {
		socket.join(roomId);
		socket.to(roomId).emit('call:joined', { username, socketId: socket.id });
	});
	socket.on('call:offer', (payload) => socket.to(payload.to).emit('call:offer', payload));
	socket.on('call:answer', (payload) => socket.to(payload.to).emit('call:answer', payload));
	socket.on('call:ice', (payload) => socket.to(payload.to).emit('call:ice', payload));
	socket.on('disconnect', () => {
		console.log('Socket disconnected:', socket.id);
	});
});

// Auth endpoint
// Auth endpoints: register & login
app.post('/api/auth/register', async (req, res) => {
	try {
		const { username, password, email } = req.body;
		if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
		const dbi = db.getDb();
		const hashed = await bcrypt.hash(password, 10);
		const user = { username, password: hashed, email, role: 'user', avatar: null };
		await dbi.collection('users').insertOne(user);
		const token = signToken({ username });
		res.json({ success: true, token, user: { username, email, role: user.role, avatar: null } });
	} catch (err) {
		console.error('Register error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.post('/api/auth/login', async (req, res) => {
	try {
		const { username, password } = req.body;
		const dbi = db.getDb();
		const user = await dbi.collection('users').findOne({ username });
		if (!user) return res.status(401).json({ error: 'Invalid credentials' });
		const ok = await bcrypt.compare(password, user.password);
		if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
		const token = signToken({ username });
		res.json({ success: true, token, user: { username: user.username, email: user.email, role: user.role, avatar: user.avatar } });
	} catch (err) {
		console.error('Login error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Me endpoint
app.get('/api/auth/me', async (req, res) => {
	try {
		const auth = req.headers.authorization;
		if (!auth) return res.status(401).json({ error: 'Unauthorized' });
		const token = auth.split(' ')[1];
		const payload = verifyToken(token);
		const dbi = db.getDb();
		const user = await dbi.collection('users').findOne({ username: payload.username }, { projection: { password: 0 } });
		res.json({ user });
	} catch (err) {
		console.error('Me error:', err);
		res.status(401).json({ error: 'Invalid token' });
	}
});

// Avatar upload for authenticated users
app.post('/api/auth/avatar', jwtMiddleware, upload.single('avatar'), async (req, res) => {
	try {
		if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
		const imagePath = `/uploads/${path.basename(req.file.path)}`;
		const dbi = db.getDb();
		await dbi.collection('users').updateOne({ username: req.user.username }, { $set: { avatar: imagePath } });
		res.json({ success: true, avatar: imagePath });
	} catch (err) {
		console.error('Avatar upload error:', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Users endpoints (admin features omitted for brevity)
app.get('/api/users', async (req, res) => {
  const dbi = db.getDb();
  const users = await dbi.collection('users').find({}, { projection: { password: 0 } }).toArray();
  res.json(users);
});

// Update user role (super admin only)
app.put('/api/users/:username', (req, res) => {
	try {
		console.log('User update request received:', req.params.username, req.body);
		const { requester, role } = req.body;
		const username = req.params.username;
		const data = loadData();
		
		const superAdmin = data.users.find(u => u.username === requester && u.role === 'superAdmin');
		if (!superAdmin) {
			return res.status(403).json({ error: 'Only super admin can update user roles.' });
		}
		
		if (username === requester) {
			return res.status(400).json({ error: 'Super admin cannot change own role.' });
		}
		
		const userIndex = data.users.findIndex(u => u.username === username);
		if (userIndex === -1) {
			return res.status(404).json({ error: 'User not found.' });
		}
		
		const validRoles = ['user', 'groupAdmin', 'superAdmin'];
		if (!validRoles.includes(role)) {
			return res.status(400).json({ error: 'Invalid role.' });
		}
		
		// Update user role
		data.users[userIndex].role = role;
		saveData(data);
		
		console.log('User role updated successfully:', username, 'to', role);
		res.json({ success: true, user: data.users[userIndex] });
	} catch (error) {
		console.error('Error updating user role:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Delete a user (super admin only)
app.delete('/api/users/:username', (req, res) => {
	const { requester } = req.body;
	const data = loadData();
	const superAdmin = data.users.find(u => u.username === requester && u.role === 'superAdmin');
	if (!superAdmin) {
		return res.status(403).json({ error: 'Only super admin can delete users.' });
	}
	const username = req.params.username;
	if (username === requester) {
		return res.status(400).json({ error: 'Super admin cannot delete self.' });
	}
	const userIndex = data.users.findIndex(u => u.username === username);
	if (userIndex === -1) {
		return res.status(404).json({ error: 'User not found.' });
	}
	data.users.splice(userIndex, 1);
	saveData(data);
	res.json({ success: true });
});


// Get all groups
app.get('/api/groups', async (req, res) => {
	const dbi = db.getDb();
	const groups = await dbi.collection('groups').find().toArray();
	res.json(groups);
});

// Create a new group (super admin only)
app.post('/api/groups', async (req, res) => {
  try {
	const { requester, name, adminIds } = req.body;
	const dbi = db.getDb();
	const user = await dbi.collection('users').findOne({ username: requester });
	if (!user || user.role !== 'superAdmin') return res.status(403).json({ error: 'Only super admin can create groups.' });
	if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required.' });
	if (await dbi.collection('groups').findOne({ name: { $regex: `^${name}$`, $options: 'i' } })) return res.status(400).json({ error: 'Group name already exists.' });
	const newGroup = { name: name.trim(), ownerId: requester, adminIds: [requester, ...(adminIds || [])], memberIds: [requester], channelIds: [] };
	const r = await dbi.collection('groups').insertOne(newGroup);
	newGroup._id = r.insertedId;
	res.json({ success: true, group: newGroup });
  } catch (err) {
	console.error('Error creating group:', err);
	res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a group (super admin only)
app.delete('/api/groups/:groupId', (req, res) => {
	try {
		console.log('Group deletion request received:', req.params.groupId, req.body);
		const { requester } = req.body;
		const groupId = req.params.groupId;
		const data = loadData();
		const user = data.users.find(u => u.username === requester);
		
		if (!user || user.role !== 'superAdmin') {
			return res.status(403).json({ error: 'Only super admin can delete groups.' });
		}
		
		const groupIndex = data.groups.findIndex(g => g.id === groupId);
		if (groupIndex === -1) {
			return res.status(404).json({ error: 'Group not found.' });
		}
		
		const group = data.groups[groupIndex];
		
		// Don't allow deleting the General group
		if (group.name === 'General' || group.id === 'g1') {
			return res.status(400).json({ error: 'Cannot delete the General group.' });
		}
		
		// Remove all channels associated with this group
		data.channels = data.channels.filter(c => c.groupId !== groupId);
		
		// Remove the group
		data.groups.splice(groupIndex, 1);
		
		saveData(data);
		
		console.log('Group deleted successfully:', groupId);
		res.json({ success: true });
	} catch (error) {
		console.error('Error deleting group:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get all channels
app.get('/api/channels', async (req, res) => {
	const { groupId } = req.query;
	const dbi = db.getDb();
	const filter = groupId ? { groupId } : {};
	const channels = await dbi.collection('channels').find(filter).toArray();
	res.json(channels);
});

// Create a new channel (group/super admin only)
app.post('/api/channels', async (req, res) => {
	try {
		const { requester, groupId, name } = req.body;
		const dbi = db.getDb();
		const user = await dbi.collection('users').findOne({ username: requester });
		const group = await dbi.collection('groups').findOne({ _id: groupId } ) || await dbi.collection('groups').findOne({ id: groupId });
		if (!user || !group) return res.status(400).json({ error: 'User or group not found.' });
		if (!(user.role === 'superAdmin' || (user.role === 'groupAdmin' && (group.adminIds || []).includes(user.username)))) return res.status(403).json({ error: 'Only group/super admin can create channels.' });
		if (await dbi.collection('channels').findOne({ groupId, name })) return res.status(400).json({ error: 'Channel name already exists.' });
		const newChannel = { groupId, name, memberIds: group.memberIds || [requester] };
		const r = await dbi.collection('channels').insertOne(newChannel);
		newChannel._id = r.insertedId;
		// update group
		await dbi.collection('groups').updateOne({ _id: group._id }, { $push: { channelIds: newChannel._id } });
		res.json({ success: true, channel: newChannel });
	} catch (err) {
		console.error('Error creating channel:', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Messages REST endpoints
app.get('/api/messages', async (req, res) => {
	try {
		const { channelId, page = 1, pageSize = 50 } = req.query;
		if (!channelId) return res.status(400).json({ error: 'channelId required' });
		const dbi = db.getDb();
		const skip = (Number(page) - 1) * Number(pageSize);
		const cursor = dbi.collection('messages').find({ channelId }).sort({ timestamp: -1 }).skip(skip).limit(Number(pageSize));
		const messages = await cursor.toArray();
		res.json({ messages: messages.reverse() });
	} catch (err) {
		console.error('Error getting messages:', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.post('/api/messages', async (req, res) => {
	try {
		const { channelId, sender, text, type = 'text' } = req.body;
		if (!channelId || !sender) return res.status(400).json({ error: 'Missing fields' });
		const message = { channelId, sender, text: text || null, type, imagePath: null, timestamp: new Date() };
		const dbi = db.getDb();
		const r = await dbi.collection('messages').insertOne(message);
		message._id = r.insertedId;
		// Broadcast via sockets
		io.to(channelId).emit('message', message);
		res.json({ success: true, message });
	} catch (err) {
		console.error('Error posting message:', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.post('/api/messages/image', upload.single('image'), async (req, res) => {
	try {
		const { channelId, sender } = req.body;
		if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
		const imagePath = `/uploads/${path.basename(req.file.path)}`;
		const message = { channelId, sender, text: null, type: 'image', imagePath, timestamp: new Date() };
		const dbi = db.getDb();
		const r = await dbi.collection('messages').insertOne(message);
		message._id = r.insertedId;
		io.to(channelId).emit('message', message);
		res.json({ success: true, message });
	} catch (err) {
		console.error('Error uploading image message:', err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Error handling middleware
app.use((error, req, res, next) => {
	console.error('Unhandled error:', error);
	res.status(500).json({ error: 'Internal server error' });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error);
	process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1);
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
	console.log(`Data path: ${path.join(__dirname, 'data.json')}`);
});
