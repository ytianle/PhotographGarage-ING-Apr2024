import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

interface LoginModalProps {
  open: boolean;
  onSkip?: () => void;
  onClose?: () => void;
}

export function LoginModal({ open, onSkip, onClose }: LoginModalProps) {
  const { login, error, clearError, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      clearError();
    }
  }, [open, clearError]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username || !password) {
      return;
    }
    await login(username.trim(), password.trim());
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <form className="login-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <h2>Hola! Please login</h2>
        <input
          type="text"
          placeholder="Account"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Logging in..." : "Log in"}
        </button>
        {onSkip && (
          <button type="button" className="login-skip" onClick={onSkip} disabled={isLoading}>
            Continue as guest
          </button>
        )}
        <div className="login-error">{error}</div>
      </form>
    </div>
  );
}
