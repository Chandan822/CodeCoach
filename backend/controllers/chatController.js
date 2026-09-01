const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Groq = require('groq-sdk');
const axios = require('axios');
const { decrypt } = require('../utils/crypto');

const performTavilySearch = async (query) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey === 'your_tavily_api_key_here') {
    return 'Search failed: Tavily API key is not configured on the server.';
  }
  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query: query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 3,
    });
    
    const results = response.data?.results || [];
    if (results.length === 0) return 'No search results found.';
    
    return results
      .map((r, i) => `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content ? r.content.substring(0, 400) + '...' : 'No description'}`)
      .join('\n\n');
  } catch (error) {
    console.error('Tavily search error:', error?.response?.data || error.message);
    return `Search error: ${error.message}`;
  }
};

const generateImagePollinations = async (prompt) => {
  const response = await axios.get(
    `https://image.pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`,
    { responseType: 'arraybuffer', timeout: 15000 }
  );
  const base64Image = Buffer.from(response.data, 'binary').toString('base64');
  return `data:image/jpeg;base64,${base64Image}`;
};

const generateImageHuggingFace = async (prompt) => {
  if (!process.env.HF_API_KEY) {
    throw new Error('Hugging Face API key not configured on server.');
  }
  const response = await axios.post(
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    { inputs: prompt },
    {
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 25000,
    }
  );
  const base64Image = Buffer.from(response.data, 'binary').toString('base64');
  return `data:image/jpeg;base64,${base64Image}`;
};

const CONTEXT_MESSAGE_LIMIT = 10;
const MAX_IMAGE_FILES = 5;
const MAX_TEXT_FILES = 2;
const MAX_TEXT_FILE_SIZE_BYTES = 1 * 1024 * 1024;
const NOVA_SYSTEM_PROMPT = "You are NovaChat, a highly capable, creative, and clever AI assistant. You can help with writing, analysis, learning, coding, calculations, and general conversation. Output responses using clean, well-formatted markdown. If generating code, use markdown code blocks with the correct language tag.";
// Keep these IDs in sync with the currently hosted Groq models. Retired model
// IDs are rejected by Groq and would otherwise surface to clients as a 502.
const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-20b';
const VISION_MODEL = 'qwen/qwen3.6-27b';
const MISTRAL_DEFAULT_TEXT_MODEL = 'mistral-small-latest';
const MISTRAL_VISION_MODEL = 'mistral-small-latest';
const GROQ_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b'
]);
const MISTRAL_MODELS = new Set([
  'mistral-large-latest',
  'mistral-medium-latest',
  'mistral-small-latest',
  'codestral-latest'
]);
const ALLOWED_MODELS = new Set([...GROQ_MODELS, ...MISTRAL_MODELS]);

const getGroqKeys = () => {
  const envKeys = process.env.GROQ_API_KEYS
    ? process.env.GROQ_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean)
    : [];
  if (envKeys.length > 0) return envKeys;
  return process.env.GROQ_API_KEY ? [process.env.GROQ_API_KEY.trim()] : [];
};

const getApiKeyForUser = (userId, keys) => {
  if (!keys || keys.length === 0) return null;
  if (!userId) {
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  }
  let hash = 0;
  const idStr = String(userId);
  for (let i = 0; i < idStr.length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % keys.length;
  return keys[index];
};

const getApiKeysForRequest = (userId, keys) => {
  const primaryKey = getApiKeyForUser(userId, keys);
  if (!primaryKey) return [];
  return [primaryKey, ...keys.filter((key) => key !== primaryKey)];
};

const getMistralKeys = () => {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  return apiKey ? [apiKey] : [];
};

const getProviderForModel = (model) => MISTRAL_MODELS.has(model) ? 'mistral' : 'groq';

const getGroqErrorStatus = (error) => Number(
  error?.status || error?.statusCode || error?.response?.status || 0
);

const getGroqErrorMessage = (error) => {
  if (typeof error?.error === 'string') return error.error;
  if (error?.error?.message) return error.error.message;
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  return error?.message || 'Unknown provider error';
};

const getGroqRetryAfter = (error) => {
  if (typeof error?.headers?.get === 'function') {
    return error.headers.get('retry-after');
  }
  return error?.headers?.['retry-after'] || null;
};

const isRetryableGroqError = (error) => [401, 403, 429, 500, 502, 503].includes(getGroqErrorStatus(error));

const createCompletionWithKeyFallback = async ({ apiKeys, model, messages }) => {
  let lastError;

  for (const apiKey of apiKeys) {
    try {
      const groq = new Groq({ apiKey });
      return await groq.chat.completions.create({ messages, model });
    } catch (error) {
      lastError = error;
      console.error(`Groq request failed for one configured key (status ${getGroqErrorStatus(error) || 'unknown'}):`, getGroqErrorMessage(error));

      if (!isRetryableGroqError(error)) break;
    }
  }

  throw lastError;
};

const toMistralMessages = (messages) => messages.map((message) => ({
  ...message,
  content: Array.isArray(message.content)
    ? message.content.map((part) => part.type === 'image_url'
      ? { ...part, image_url: part.image_url?.url || part.image_url }
      : part)
    : message.content,
}));

const createMistralCompletion = async ({ apiKey, model, messages }) => {
  try {
    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model,
        messages: toMistralMessages(messages),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    return response.data;
  } catch (error) {
    const providerError = new Error(getGroqErrorMessage(error));
    providerError.status = getGroqErrorStatus(error);
    providerError.headers = error.response?.headers;
    providerError.response = error.response;
    throw providerError;
  }
};

const createProviderCompletion = async ({ provider, apiKeys, model, messages }) => {
  if (provider === 'mistral') {
    return createMistralCompletion({ apiKey: apiKeys[0], model, messages });
  }

  return createCompletionWithKeyFallback({ apiKeys, model, messages });
};

const normalizeAssistantContent = (content) => {
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : part?.text || '')
      .join('');
  }

  return typeof content === 'string' ? content : '';
};

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

const getMessageContentForContext = (message) => {
  let content = message.content;
  const textAttachments = message.attachments?.filter((file) => file.kind === 'text' && file.textContent) || [];

  if (textAttachments.length > 0) {
    const attachmentText = textAttachments
      .map((file) => `--- ${file.fileName} (${file.mimeType}) ---\n${file.textContent}`)
      .join('\n\n');

    content = `${content}\n\nAttached text files:\n${attachmentText}`;
  }

  const imageAttachments = message.attachments?.filter((file) => file.kind === 'image') || [];
  if (imageAttachments.length > 0) {
    const imageList = imageAttachments.map((file) => file.fileName).join(', ');
    content = `${content}\n\nAttached image files: ${imageList}`;
  }

  return content;
};

const toGroqMessages = (messages) => messages
  .filter((m) => m.role === 'user' || m.role === 'assistant')
  .map((m) => ({
    role: m.role,
    content: getMessageContentForContext(m),
  }));

const formatTranscript = (messages) => messages
  .map((m, index) => `${index + 1}. ${m.role.toUpperCase()}: ${m.content}`)
  .join('\n\n');

const fallbackSummary = (messages) => messages
  .map((m) => {
    const compactContent = String(m.content || '').replace(/\s+/g, ' ').trim();
    return `${m.role}: ${compactContent.slice(0, 240)}${compactContent.length > 240 ? '...' : ''}`;
  })
  .join('\n');

const summarizeMessages = async (provider, apiKeys, messages) => {
  if (messages.length === 0) return null;

  try {
    const result = await createProviderCompletion({
      provider,
      apiKeys,
      model: provider === 'mistral' ? MISTRAL_DEFAULT_TEXT_MODEL : DEFAULT_TEXT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Summarize the earlier chat context for a general-purpose AI assistant. Keep important user goals, key details, constraints, decisions, and unresolved questions. Be concise and factual.',
        },
        {
          role: 'user',
          content: `Summarize this older conversation in 8 short bullet points or fewer:\n\n${formatTranscript(messages)}`,
        },
      ],
    });

    return result.choices[0]?.message?.content?.trim() || fallbackSummary(messages);
  } catch (error) {
    console.error('Failed to summarize older messages:', error);
    return fallbackSummary(messages);
  }
};

const buildContextMessages = async (provider, apiKeys, allMessages) => {
  const groqMessages = toGroqMessages(allMessages);
  const recentMessages = groqMessages.slice(-CONTEXT_MESSAGE_LIMIT);
  const olderMessages = groqMessages.slice(0, -CONTEXT_MESSAGE_LIMIT);

  if (olderMessages.length === 0) {
    return recentMessages;
  }

  const summary = await summarizeMessages(provider, apiKeys, olderMessages);
  return [
    {
      role: 'system',
      content: `Short summary of earlier messages before the latest ${CONTEXT_MESSAGE_LIMIT} messages:\n${summary}`,
    },
    ...recentMessages,
  ];
};

const processUploads = (files = []) => {
  const imageFiles = files.filter((file) => file.mimetype.startsWith('image/'));
  const textFiles = files.filter((file) => !file.mimetype.startsWith('image/'));

  if (imageFiles.length > MAX_IMAGE_FILES) {
    const error = new Error(`You can upload at most ${MAX_IMAGE_FILES} images per message.`);
    error.statusCode = 400;
    throw error;
  }

  if (textFiles.length > MAX_TEXT_FILES) {
    const error = new Error(`You can upload at most ${MAX_TEXT_FILES} text files per message.`);
    error.statusCode = 400;
    throw error;
  }

  const attachments = [];
  const imageParts = [];

  for (const file of imageFiles) {
    attachments.push({
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      kind: 'image',
    });

    imageParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      },
    });
  }

  for (const file of textFiles) {
    if (file.size > MAX_TEXT_FILE_SIZE_BYTES) {
      const error = new Error('Each text file must be 1MB or smaller.');
      error.statusCode = 400;
      throw error;
    }

    attachments.push({
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      kind: 'text',
      textContent: file.buffer.toString('utf8'),
    });
  }

  return { attachments, imageParts };
};

const applyCurrentImagesToContext = (contextMessages, imageParts) => {
  if (imageParts.length === 0 || contextMessages.length === 0) {
    return contextMessages;
  }

  const updatedMessages = [...contextMessages];
  const lastIndex = updatedMessages.length - 1;
  const lastMessage = updatedMessages[lastIndex];

  if (lastMessage.role !== 'user') {
    return contextMessages;
  }

  updatedMessages[lastIndex] = {
    ...lastMessage,
    content: [
      { type: 'text', text: lastMessage.content },
      ...imageParts,
    ],
  };

  return updatedMessages;
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
    const content = req.body.content?.trim() || '';
    const { attachments, imageParts } = processUploads(req.files || []);
    const messageContent = content || (
      attachments.length > 0
        ? `Uploaded ${attachments.length} file${attachments.length > 1 ? 's' : ''}.`
        : ''
    );

    if (!messageContent) {
      return res.status(400).json({ message: 'Message content or attachments are required' });
    }

    // Validate chat
    const chat = await Chat.findOne({ _id: chatId, userId: req.user._id, isActive: true });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Handle Image Generation if requested
    const isImageGen = req.body.isImageGen === 'true' || req.body.isImageGen === true;
    if (isImageGen) {
      // Check daily limit (3 images per day)
      const todayStr = new Date().toISOString().split('T')[0];
      const user = await User.findById(req.user._id);

      if (user.lastImageGenDate === todayStr) {
        if (user.imageGenCount >= 3) {
          return res.status(429).json({ message: 'Daily limit of 3 images reached. Try again tomorrow.' });
        }
      } else {
        // Reset count for new day
        user.lastImageGenDate = todayStr;
        user.imageGenCount = 0;
        await user.save();
      }

      const preferredEngine = req.body.imageEngine || 'pollinations';
      let imageUrl = null;
      let usedEngine = preferredEngine;
      const errorLog = [];

      // Try preferred engine first
      try {
        if (preferredEngine === 'huggingface') {
          imageUrl = await generateImageHuggingFace(content);
        } else {
          imageUrl = await generateImagePollinations(content);
        }
      } catch (err) {
        console.error(`Preferred engine (${preferredEngine}) failed:`, err.message);
        errorLog.push(`${preferredEngine}: ${err.message}`);
        
        // Failover to other engine
        const fallbackEngine = preferredEngine === 'huggingface' ? 'pollinations' : 'huggingface';
        console.log(`Attempting fallback to ${fallbackEngine}...`);
        try {
          if (fallbackEngine === 'huggingface') {
            imageUrl = await generateImageHuggingFace(content);
          } else {
            imageUrl = await generateImagePollinations(content);
          }
          usedEngine = fallbackEngine;
        } catch (fallbackErr) {
          console.error(`Fallback engine (${fallbackEngine}) failed:`, fallbackErr.message);
          errorLog.push(`${fallbackEngine}: ${fallbackErr.message}`);
        }
      }

      if (!imageUrl) {
        return res.status(502).json({
          message: 'Failed to generate image from all available services.',
          details: errorLog.join(' | ')
        });
      }

      // Save user message (prompt)
      const userMessage = new Message({
        chatId,
        userId: req.user._id,
        role: 'user',
        content: `Generate image: "${content}"`,
      });
      await userMessage.save();

      // Save assistant message (image markdown)
      const responseText = `![Generated Image: ${content}](${imageUrl})`;
      const assistantMessage = new Message({
        chatId,
        userId: req.user._id,
        role: 'assistant',
        content: responseText,
        metadata: {
          model: `ImageGen (${usedEngine})`,
          processingTime: 0,
        }
      });
      await assistantMessage.save();

      // Update User Gen Stats
      user.imageGenCount += 1;
      await user.save();

      // Update Chat stats
      chat.messageCount += 2;
      chat.updatedAt = Date.now();
      
      if (chat.messageCount === 2) {
        chat.title = `Image: ${content.substring(0, 20)}`;
      }
      await chat.save();

      return res.status(200).json({
        userMessage,
        assistantMessage
      });
    }

    // Extract code snippets from user content (if any)
    const userSnippets = extractCodeSnippets(messageContent);
    
    // Save User Message
    const userMessage = new Message({
      chatId,
      userId: req.user._id,
      role: 'user',
      content: messageContent,
      hasCode: userSnippets.length > 0,
      codeSnippets: userSnippets,
      attachments,
    });
    await userMessage.save();

    // Determine the text model to use (default or dynamic selection)
    let selectedTextModel = req.body.model || DEFAULT_TEXT_MODEL;
    if (!ALLOWED_MODELS.has(selectedTextModel)) {
      selectedTextModel = DEFAULT_TEXT_MODEL;
    }
    const provider = getProviderForModel(selectedTextModel);
    const model = imageParts.length > 0
      ? (provider === 'mistral' ? MISTRAL_VISION_MODEL : VISION_MODEL)
      : selectedTextModel;

    // Select credentials for the requested provider. User-supplied keys remain
    // Groq keys; the Mistral integration intentionally uses the server env key.
    let apiKeys = [];
    if (provider === 'mistral') {
      apiKeys = getMistralKeys();
    } else if (req.user?.groqApiKey && req.user?.groqApiKeyIv) {
      try {
        const userApiKey = decrypt(req.user.groqApiKey, req.user.groqApiKeyIv);
        if (userApiKey) apiKeys = [userApiKey];
      } catch (decryptError) {
        console.error('Failed to decrypt user Groq API key, falling back to system keys:', decryptError);
      }
    }

    if (provider === 'groq' && apiKeys.length === 0) {
      const availableKeys = getGroqKeys();
      apiKeys = getApiKeysForRequest(req.user?._id, availableKeys);
    }

    if (apiKeys.length === 0) {
      return res.status(500).json({
        message: provider === 'mistral'
          ? 'No Mistral API key configured on server.'
          : 'No Groq API keys configured on server.'
      });
    }

    // Fetch all messages after saving the current user message.
    // The latest 10 are sent verbatim; anything older is summarized.
    const allMessages = await Message.find({ chatId }).sort({ timestamp: 1 });
    let contextMessages = applyCurrentImagesToContext(
      await buildContextMessages(provider, apiKeys, allMessages),
      imageParts
    );
    
    const isWebSearch = req.body.webSearch === 'true' || req.body.webSearch === true;
    if (isWebSearch && content) {
      const searchResult = await performTavilySearch(content);
      contextMessages.push({
        role: 'system',
        content: `Live Web Search Results for "${content}":\n\n${searchResult}\n\nUse the search results above to answer the user's query accurately. Cite the source URLs if available.`
      });
    }
    
    // Send the message and get response
    const startTime = Date.now();
    let result;
    try {
      result = await createProviderCompletion({
        provider,
        apiKeys,
        model,
        messages: [
          {
            role: "system",
            content: NOVA_SYSTEM_PROMPT
          },
          ...contextMessages
        ],
      });
    } catch (groqError) {
      console.error(`------- ${provider.toUpperCase()} API CRASH -------`);
      console.error(groqError);
      console.error('--------------------------------');
      const providerStatus = getGroqErrorStatus(groqError);
      const responseStatus = [400, 401, 402, 403, 404, 413, 422, 429].includes(providerStatus)
        ? providerStatus
        : 502;
      return res.status(responseStatus).json({
        message: providerStatus === 429
          ? `${provider === 'mistral' ? 'Mistral' : 'Groq'} rate limit reached. Please wait a moment and try again.`
          : 'Error from AI provider',
        details: getGroqErrorMessage(groqError),
        retryAfter: getGroqRetryAfter(groqError),
      });
    }
    
    let responseText = normalizeAssistantContent(result.choices[0]?.message?.content)
      || "Sorry, I couldn't generate a response.";
    // Remove <think>...</think> blocks from the model's response
    responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
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
        model,
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
      chat.title = messageContent.substring(0, 30) + (messageContent.length > 30 ? '...' : '');
    }
    await chat.save();

    return res.status(200).json({
      userMessage,
      assistantMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error processing your message' });
  }
};

// Send an anonymous message (No DB saving, no Auth)
exports.sendAnonymousMessage = async (req, res) => {
  try {
    const { content, history = [] } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Determine the text model to use (default or dynamic selection)
    let selectedTextModel = req.body.model || DEFAULT_TEXT_MODEL;
    if (!ALLOWED_MODELS.has(selectedTextModel)) {
      selectedTextModel = DEFAULT_TEXT_MODEL;
    }
    const provider = getProviderForModel(selectedTextModel);

    const apiKeys = provider === 'mistral'
      ? getMistralKeys()
      : getApiKeysForRequest(null, getGroqKeys()); // anonymous guest has null userId
    if (apiKeys.length === 0) {
      return res.status(500).json({
        message: provider === 'mistral'
          ? 'No Mistral API key configured on server.'
          : 'No Groq API keys configured on server.'
      });
    }

    // Anonymous history lives in frontend state. Add the current message once,
    // then summarize older context if the conversation is longer than 10 messages.
    const allMessages = [
      ...history,
      { role: 'user', content },
    ];
    let contextMessages = await buildContextMessages(provider, apiKeys, allMessages);
    
    const isWebSearch = req.body.webSearch === 'true' || req.body.webSearch === true;
    if (isWebSearch && content) {
      const searchResult = await performTavilySearch(content);
      contextMessages.push({
        role: 'system',
        content: `Live Web Search Results for "${content}":\n\n${searchResult}\n\nUse the search results above to answer the user's query accurately. Cite the source URLs if available.`
      });
    }
    
    // Send the message and get response
    const startTime = Date.now();
    let result;
    try {
      result = await createProviderCompletion({
        provider,
        apiKeys,
        model: selectedTextModel,
        messages: [
          {
            role: "system",
            content: NOVA_SYSTEM_PROMPT
          },
          ...contextMessages
        ],
      });
    } catch (groqError) {
      console.error(`------- ${provider.toUpperCase()} API CRASH -------`);
      console.error(groqError);
      console.error('--------------------------------');
      const providerStatus = getGroqErrorStatus(groqError);
      const responseStatus = [400, 401, 402, 403, 404, 413, 422, 429].includes(providerStatus)
        ? providerStatus
        : 502;
      return res.status(responseStatus).json({
        message: providerStatus === 429
          ? `${provider === 'mistral' ? 'Mistral' : 'Groq'} rate limit reached. Please wait a moment and try again.`
          : 'Error from AI provider',
        details: getGroqErrorMessage(groqError),
        retryAfter: getGroqRetryAfter(groqError),
      });
    }
    
    let responseText = normalizeAssistantContent(result.choices[0]?.message?.content)
      || "Sorry, I couldn't generate a response.";
    // Remove <think>...</think> blocks from the model's response
    responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const processingTime = Date.now() - startTime;

    // Parse code snippets from the model's response
    const assistantSnippets = extractCodeSnippets(responseText);

    const assistantMessage = {
      role: 'assistant',
      content: responseText,
      hasCode: assistantSnippets.length > 0,
      codeSnippets: assistantSnippets,
      timestamp: new Date(),
      metadata: {
        model: selectedTextModel,
        processingTime,
      }
    };

    const userMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
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
