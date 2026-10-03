import { useState } from "react";
import axios from "axios";
import { ShieldCheck, Mail, Lock, ArrowLeft } from "lucide-react";

function AdminLogin({ onAdminLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          email,
          password,
        }
      );

      const { token, user } = response.data;

      // Only admin can enter this portal
      if (user.role !== "admin") {
        setError("Access denied. Admin account required.");
        return;
      }

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      onAdminLogin(user);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Invalid admin email or password"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-brand">
          <div className="auth-logo">
            <ShieldCheck size={28} />
          </div>

          <div>
            <h1>PICT Canteen</h1>
            <span>Administration Portal</span>
          </div>
        </div>

        <div className="auth-header">
          <h2>Admin Login</h2>
          <p>Sign in to manage the canteen</p>
        </div>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >

          <div className="form-group">
            <label>Email</label>

            <div className="input-wrapper">
              <Mail size={18} />

              <input
                type="email"
                placeholder="admin@pict.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>

            <div className="input-wrapper">
              <Lock size={18} />

              <input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in as Admin"}
          </button>

        </form>

        <button
          className="admin-back-button"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          Back to Student Portal
        </button>

      </div>
    </div>
  );
}

export default AdminLogin;