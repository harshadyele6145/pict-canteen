import { useState } from "react";
import axios from "axios";

function Register({ onRegister, onSwitch }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!name || !email || !password) {
      setError("Please fill all fields.");
      return;
    }

    if (password.length < 6) {
      setError(
        "Password must be at least 6 characters."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
        "http://localhost:5000/api/auth/register",
        {
          name,
          email,
          password,
        }
      );

      const { token, user } = response.data;

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      onRegister(user);
    } catch (error) {
      console.error("Registration error:", error);

      setError(
        error.response?.data?.message ||
          "Registration failed."
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
          <span>GET STARTED</span>

          <h2>Create your account</h2>
        </div>

        {/* FORM */}
        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >

          {/* NAME */}
          <div className="form-group">
            <label htmlFor="name">
              Full Name
            </label>

            <input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
            />
          </div>

          {/* EMAIL */}
          <div className="form-group">
            <label htmlFor="register-email">
              Email Address
            </label>

            <input
              id="register-email"
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
            <label htmlFor="register-password">
              Password
            </label>

            <input
              id="register-password"
              type="password"
              placeholder="Minimum 6 characters"
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

          {/* REGISTER BUTTON */}
          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Creating account..."
              : "Create Account"}
          </button>

        </form>

        {/* LOGIN */}
        <div className="auth-switch">
          Already have an account?

          <button
            type="button"
            onClick={onSwitch}
          >
            Login
          </button>
        </div>

      </div>
    </div>
  );
}

export default Register;