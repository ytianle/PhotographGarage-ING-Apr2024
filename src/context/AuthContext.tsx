import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

const TOKEN_KEY = "authToken";
const LOGIN_ENDPOINT = "https://x67i134qw3.execute-api.us-west-2.amazonaws.com/prod/login";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && !isTokenExpired(stored)) {
      return stored;
    }
    if (stored) {
      localStorage.removeItem(TOKEN_KEY);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY) {
        if (event.newValue && !isTokenExpired(event.newValue)) {
          setToken(event.newValue);
        } else {
          setToken(null);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        mode: "cors"
      });

      if (!response.ok) {
        const fallback = await safeParseResponse(response);
        setError(fallback ?? "Login failed");
        return false;
      }

      const payload = await response.json();
      const parsedBody = safeParseJSON<{ token?: string; message?: string }>(payload.body);
      const receivedToken = parsedBody?.token;

      if (!receivedToken) {
        setError(parsedBody?.message ?? "Token missing in response");
        return false;
      }

      if (isTokenExpired(receivedToken)) {
        setError("Server issued an expired token");
        return false;
      }

      localStorage.setItem(TOKEN_KEY, receivedToken);
      setToken(receivedToken);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      error,
      login,
      logout,
      clearError
    }),
    [token, isLoading, error, login, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(atob(payload));
    const exp = decoded?.exp;
    if (typeof exp !== "number") {
      return true;
    }
    return Date.now() > exp * 1000;
  } catch (error) {
    return true;
  }
}

async function safeParseResponse(response: Response): Promise<string | null> {
  try {
    const data = await response.json();
    if (typeof data === "string") {
      return data;
    }
    if (data && typeof data === "object") {
      if ("message" in data && typeof data.message === "string") {
        return data.message;
      }
      if ("error" in data && typeof data.error === "string") {
        return data.error;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

function safeParseJSON<T>(value: unknown): T | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    return null;
  }
}
