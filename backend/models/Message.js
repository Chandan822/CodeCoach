const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    default: null, // For code snippets
  },
  hasCode: {
    type: Boolean,
    default: false,
  },
  codeSnippets: [{
    language: String,
    code: String,
    fileName: String,
  }],
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
  },
  metadata: {
    model: String, // AI model used
    tokens: Number, // Token count
    processingTime: Number, // Response time in ms
  },
});

// Create compound index for efficient chat message retrieval
messageSchema.index({ chatId: 1, timestamp: 1 });

module.exports = mongoose.model('Message', messageSchema);
