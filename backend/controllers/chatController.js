const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Groq = require('groq-sdk');

// Helper to extract code snippets from markdown text
const extractCodeSnippets = (text) => {
  const codeSnippets = [];
  const regex = /```([\w-]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    codeSnippets.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    });
  }
  return codeSnippets;
};

// Start a new chat
exports.createChat = async (req, res) => {
  try {
    const { title } = req.body;
    const newChat = new Chat({
      userId: req.user._id,
      title: title || 'New Chat',
    });
    const savedChat = await newChat.save();
    res.status(201).json(savedChat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: 'Server error creating chat' });
  }
};

// Get all chats for a user
exports.getUserChats = async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user._id, isActive: true })
      .sort({ updatedAt: -1 });
    res.json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ message: 'Server error fetching chats' });
  }
};

// Delete a chat (soft delete)
exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    chat.isActive = false;
    await chat.save();
    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ message: 'Server error deleting chat' });
  }
};

// Get all messages for a chat
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Ensure chat belongs to user
    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id, isActive: true });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const messages = await Message.find({ chatId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
};

// Send a new message
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Validate chat
    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id, isActive: true });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Extract code snippets from user content (if any)
    const userSnippets = extractCodeSnippets(content);
    
    // Save User Message
    const userMessage = new Message({
      chatId,
      userId: req.user._id,
      role: 'user',
      content,
      hasCode: userSnippets.length > 0,
      codeSnippets: userSnippets,
    });
    await userMessage.save();

    // Fetch previous messages for context
    const previousMessages = await Message.find({ chatId }).sort({ timestamp: 1 });
    
    // Map to Groq format
    const history = previousMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
      
    // Append the current message
    history.push({ role: 'user', content });

    // Initialize Groq API
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    // Send the message and get response
    const startTime = Date.now();
    let result;
    try {
      result = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are CodeCoach, an expert software engineering tutor and AI study buddy. You help students learn programming, understand algorithms, and debug code. Output responses using markdown. If generating code, use markdown code blocks with the correct language tag."
          },
          ...history
        ],
        model: "llama-3.3-70b-versatile",
      });
    } catch (groqError) {
      console.error('------- GROQ API CRASH -------');
      console.error(groqError);
      console.error('--------------------------------');
      return res.status(502).json({ message: 'Error from AI provider', details: groqError.message });
    }
    
    const responseText = result.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    const processingTime = Date.now() - startTime;

    // Parse code snippets from the model's response
    const assistantSnippets = extractCodeSnippets(responseText);

    // Save Assistant Message
    const assistantMessage = new Message({
      chatId,
      userId: req.user._id,
      role: 'assistant',
      content: responseText,
      hasCode: assistantSnippets.length > 0,
      codeSnippets: assistantSnippets,
      metadata: {
        model: 'llama-3.3-70b-versatile',
        processingTime,
      }
    });
    await assistantMessage.save();

    // Update Chat statistics
    chat.messageCount += 2;
    chat.updatedAt = Date.now();
    
    // Automatically generate a title if it's the first message
    if (chat.messageCount === 2) {
      // Very basic title generator based on first message
      chat.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }
    await chat.save();

    return res.status(200).json({
      userMessage,
      assistantMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error processing your message' });
  }
};

// Send an anonymous message (No DB saving, no Auth)
exports.sendAnonymousMessage = async (req, res) => {
  try {
    const { content, history = [] } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Map passed history to Groq format (if any previous frontend-only messages exist)
    const formattedHistory = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
      
    // Append the current message
    formattedHistory.push({ role: 'user', content });

    // Initialize Groq API
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    // Send the message and get response
    const startTime = Date.now();
    let result;
    try {
      result = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are CodeCoach, an expert software engineering tutor and AI study buddy. You help students learn programming, understand algorithms, and debug code. Output responses using markdown. If generating code, use markdown code blocks with the correct language tag."
          },
          ...formattedHistory
        ],
        model: "llama-3.3-70b-versatile",
      });
    } catch (groqError) {
      console.error('------- GROQ API CRASH -------');
      console.error(groqError);
      console.error('--------------------------------');
      return res.status(502).json({ message: 'Error from AI provider', details: groqError.message });
    }
    
    const responseText = result.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    const processingTime = Date.now() - startTime;

    // Parse code snippets from the model's response
    const assistantSnippets = extractCodeSnippets(responseText);

    const assistantMessage = {
      role: 'assistant',
      content: responseText,
      hasCode: assistantSnippets.length > 0,
      codeSnippets: assistantSnippets,
      metadata: {
        model: 'llama-3.3-70b-versatile',
        processingTime,
      }
    };

    const userMessage = {
      role: 'user',
      content,
      hasCode: extractCodeSnippets(content).length > 0
    };

    return res.status(200).json({
      userMessage,
      assistantMessage
    });

  } catch (error) {
    console.error('Error sending anonymous message:', error);
    res.status(500).json({ message: 'Server error processing anonymous message' });
  }
};
