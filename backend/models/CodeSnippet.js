const mongoose = require('mongoose');

const codeSnippetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
  },
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  language: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  isFavorite: {
    type: Boolean,
    default: false,
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
codeSnippetSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for searching snippets
codeSnippetSchema.index({ userId: 1, language: 1 });
codeSnippetSchema.index({ tags: 1 });

module.exports = mongoose.model('CodeSnippet', codeSnippetSchema);
