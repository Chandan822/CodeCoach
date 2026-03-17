const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

// Anonymous chat route (Public)
router.post('/anonymous', chatController.sendAnonymousMessage);

// Protect all other chat routes
router.use(authMiddleware);

// Chat CRUD
router.post('/new', chatController.createChat);
router.get('/', chatController.getUserChats);
router.delete('/:chatId', chatController.deleteChat);

// Message processing
router.get('/:chatId/messages', chatController.getChatMessages);
router.post('/:chatId/message', chatController.sendMessage);

module.exports = router;
