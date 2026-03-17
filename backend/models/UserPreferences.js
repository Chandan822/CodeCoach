const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  theme: {
    type: String,
    enum: ['dark', 'light', 'auto'],
    default: 'dark',
  },
  language: {
    type: String,
    default: 'en',
  },
  preferredCodeLanguage: {
    type: String,
    default: 'javascript',
  },
  fontSize: {
    type: String,
    enum: ['small', 'medium', 'large'],
    default: 'medium',
  },
  autoSave: {
    type: Boolean,
    default: true,
  },
  codeTheme: {
    type: String,
    default: 'vs-dark',
  },
  notifications: {
    email: {
      type: Boolean,
      default: true,
    },
    push: {
      type: Boolean,
      default: false,
    },
  },
  aiSettings: {
    model: {
      type: String,
      default: 'gpt-4',
    },
    temperature: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 2,
    },
    maxTokens: {
      type: Number,
      default: 2000,
    },
  },
  sidebarCollapsed: {
    type: Boolean,
    default: false,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp before saving
userPreferencesSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('UserPreferences', userPreferencesSchema);
