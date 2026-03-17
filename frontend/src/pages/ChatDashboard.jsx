import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { LogOut, Send, MessageSquare, PlusCircle, User, Loader, Trash2, LogIn } from 'lucide-react';
import api from '../api/axios';
import '../ChatDashboard.css';

function ChatDashboard() {
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  const userName = localStorage.getItem('userName') || 'User';

  const isLoggedIn = !!localStorage.getItem('token');

  // Fetch user chats on mount if logged in
  useEffect(() => {
    if (isLoggedIn) fetchChats();
  }, [isLoggedIn]);

  // Fetch messages when current chat changes (if logged in and selecting a real chat)
  useEffect(() => {
    if (currentChatId && currentChatId !== 'anonymous' && isLoggedIn) {
      fetchMessages(currentChatId);
    } else if (currentChatId === 'anonymous') {
      // Local only, already handled
    } else {
      setMessages([]);
    }
  }, [currentChatId, isLoggedIn]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChats = async () => {
    try {
      const response = await api.get('/chat');
      setChats(response.data);
      if (response.data.length > 0 && !currentChatId) {
        setCurrentChatId(response.data[0]._id);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
      console.error('Failed to fetch chats', error);
    }
  };

  const fetchMessages = async (chatId) => {
    try {
      const response = await api.get(`/chat/${chatId}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  };

  const handleNewChat = async () => {
    if (!isLoggedIn) {
      setMessages([]);
      setCurrentChatId('anonymous');
      return;
    }
    
    try {
      const response = await api.post('/chat/new', { title: 'New Chat' });
      setChats([response.data, ...chats]);
      setCurrentChatId(response.data._id);
    } catch (error) {
      console.error('Failed to create new chat', error);
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation(); // prevent chat selection
    if (!window.confirm("Are you sure you want to delete this chat?")) return;
    try {
      await api.delete(`/chat/${chatId}`);
      setChats(prev => prev.filter(c => c._id !== chatId));
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete chat', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    if (!isLoggedIn) {
      // ANONYMOUS MODE
      const newMessage = { role: 'user', content: inputMessage };
      setMessages((prev) => [...prev, newMessage]);
      setInputMessage('');
      setLoading(true);
      
      try {
        const response = await api.post('/chat/anonymous', { 
          content: newMessage.content,
          history: messages 
        });
        setMessages((prev) => [...prev, response.data.assistantMessage]);
        setCurrentChatId('anonymous');
      } catch (error) {
        console.error('Failed to send anonymous message', error);
      } finally {
        setLoading(false);
      }
      return;
    }

    // LOGGED IN MODE
    let targetChatId = currentChatId;

    // If no active chat, create one first
    if (!targetChatId || targetChatId === 'anonymous') {
      try {
        const response = await api.post('/chat/new', { title: inputMessage.substring(0, 30) });
        targetChatId = response.data._id;
        setChats([response.data, ...chats]);
        setCurrentChatId(targetChatId);
      } catch (error) {
        console.error('Failed to create chat', error);
        return;
      }
    }

    const newMessage = { role: 'user', content: inputMessage };
    setMessages((prev) => [...prev, newMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const response = await api.post(`/chat/${targetChatId}/message`, { content: newMessage.content });
      setMessages((prev) => {
        return [...prev, response.data.assistantMessage];
      });
      fetchChats();
    } catch (error) {
      console.error('Failed to send message', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    // Reset all chat state so history is not visible after logout
    setChats([]);
    setMessages([]);
    setCurrentChatId(null);
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <h2>CodeCoach</h2>
          <button onClick={handleNewChat} className="new-chat-btn">
            <PlusCircle size={20} />
            <span>New Chat</span>
          </button>
        </div>
        
        <div className="chat-list">
          {!isLoggedIn && (
            <div className={`chat-list-item ${currentChatId === 'anonymous' ? 'active' : ''}`} onClick={() => setCurrentChatId('anonymous')}>
              <MessageSquare size={18} />
              <span className="chat-title">Anonymous Chat</span>
            </div>
          )}

          {chats.map(chat => (
            <div 
              key={chat._id} 
              className={`chat-list-item ${currentChatId === chat._id ? 'active' : ''}`}
              onClick={() => setCurrentChatId(chat._id)}
            >
              <MessageSquare size={18} />
              <span className="chat-title" title={chat.title}>{chat.title}</span>
              <Trash2 
                size={16} 
                className="delete-icon" 
                onClick={(e) => handleDeleteChat(e, chat._id)}
                style={{ marginLeft: 'auto', opacity: 0.6 }}
              />
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <User size={20} />
            <span>{isLoggedIn ? userName : 'Guest'}</span>
          </div>
          {isLoggedIn ? (
            <button onClick={handleLogout} className="logout-btn" title="Logout">
              <LogOut size={20} />
            </button>
          ) : (
            <button onClick={() => navigate('/login')} className="logout-btn" title="Login" style={{ color: '#60a5fa' }}>
              <LogIn size={20} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        {currentChatId ? (
          <>
            <div className="messages-area">
              {messages.length === 0 ? (
                <div className="empty-chat-state">
                  <h3>Start a new conversation</h3>
                  <p>Ask me anything about programming, debugging, or computer science concepts.</p>
                  {!isLoggedIn && <p style={{marginTop: '10px', fontSize: '0.85rem'}}><strong>Note:</strong> You are chatting anonymously. Messages will not be saved.</p>}
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div key={index} className={`message-bubble ${msg.role}`}>
                    <div className="message-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="message-bubble assistant">
                  <div className="message-content typing-indicator">
                    <Loader className="spinner" size={16} />
                    <span>Coach is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <form onSubmit={handleSendMessage} className="message-form">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask CodeCoach..."
                  disabled={loading}
                  autoFocus
                />
                <button type="submit" disabled={loading || !inputMessage.trim()}>
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <h2>Welcome back, {userName}!</h2>
            <p>Select a chat from the sidebar or start a new one to begin learning.</p>
            <button onClick={handleNewChat} className="start-learning-btn">
              Start Learning
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default ChatDashboard;
