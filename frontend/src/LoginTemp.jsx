import { useState } from "react";
import axios from "axios";

function Login({ onLogin, onSwitch }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!email || !password) {
      setError("Please enter email and password.");
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

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      onLogin(user);
    } catch (error) {
      console.error("Login error:", error);

      setError(
        error.response?.data?.message ||
          "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* BRAND */}
        <div className="auth-brand">
          <div className="auth-logo">
            P
          </div>

          <h1>PICT Canteen</h1>

          <p>
            Smart food ordering for PICT students
          </p>
        </div>

        {/* TITLE */}
        <div className="auth-title">
          <span>WELCOME BACK</span>

          <h2>Login to your account</h2>
        </div>

        {/* FORM */}
        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >

          {/* EMAIL */}
          <div className="form-group">
            <label htmlFor="email">
              Email Address
            </label>

            <input
              id="email"
              type="email"
              placeholder="you@pict.edu"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
            />
          </div>

          {/* PASSWORD */}
          <div className="form-group">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
            />
          </div>

          {/* ERROR */}
          {error && (
            <div
              style={{
                background: "#fff1ef",
                color: "#c15848",
                padding: "11px 13px",
                borderRadius: "10px",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          {/* LOGIN BUTTON */}
          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

        </form>

        {/* REGISTER */}
        <div className="auth-switch">
          Don't have an account?

          <button
            type="button"
            onClick={onSwitch}
          >
            Create account
          </button>
        </div>

      </div>
    </div>
  );
}

export default Login;