import { useAuth } from "../context/AuthContext";

export function LogoutButton() {
  const { logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button type="button" className="logout-button" onClick={logout}>
      Log out
    </button>
  );
}
