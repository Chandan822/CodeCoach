import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../Login.css";
import api from "../api/axios";

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : formData;
      const { data } = await api.post(endpoint, payload);

      if (data?.token && data?.user) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userName", data.user.name);
        navigate('/chat');
      } else {
        setError("Invalid server response. Please try again.");
      }
    } catch (err) {
      const serverMessage = err?.response?.data?.message;
      const status = err?.response?.status;
      if (serverMessage) {
        setError(serverMessage);
      } else if (status) {
        setError(`Request failed with status ${status}. Check backend URL/config.`);
      } else {
        setError("Failed to connect to server");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>CodeCoach</h1>
          <p>Your AI-powered programming tutor</p>
        </div>

        <h2>{isLogin ? "Welcome back" : "Create account"}</h2>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Your name" required />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" required minLength="6" />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Please wait..." : isLogin ? "Sign in" : "Sign up"}
          </button>
        </form>

        <div className="toggle-auth">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "Sign up" : "Sign in"}
          </span>
        </div>

        <div className="skip-login">
          <Link to="/">Continue as Guest →</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
