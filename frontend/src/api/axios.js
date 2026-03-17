import axios from 'axios';

const api = axios.create({
  baseURL: 'https://codecoach-tslg.onrender.com/api', // Backend base URL
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
