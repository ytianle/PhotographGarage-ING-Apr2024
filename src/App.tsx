import "@fancyapps/ui/dist/fancybox/fancybox.css";
import "./styles/app.css";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { GalleryProvider, useGallery } from "./context/GalleryContext";
import { Breadcrumb } from "./components/Breadcrumb";
import { ControlPanel } from "./components/ControlPanel";
import { GalleryGrid } from "./components/GalleryGrid";
import { Loader } from "./components/Loader";
import { LoginModal } from "./components/LoginModal";
import { LogoutButton } from "./components/LogoutButton";

function App() {
  return (
    <AuthProvider>
      <GalleryProvider>
        <Shell />
      </GalleryProvider>
    </AuthProvider>
  );
}

function Shell() {
  const { isAuthenticated } = useAuth();
  const { isLoading, loadingProgress, loadingTotal, loadingProcessed, error, root } = useGallery();

  return (
    <div className="app-shell">
      <Loader
        active={isLoading}
        progress={loadingProgress}
        total={loadingTotal}
        processed={loadingProcessed}
      />
      <LoginModal open={!isAuthenticated} />
      {isAuthenticated && root && <ControlPanel />}
      {isAuthenticated && <LogoutButton />}
      <main className="app-content">
        {isAuthenticated && (
          <>
            <Breadcrumb />
            {error && <ErrorBanner message={error} />}
            <GalleryGrid />
          </>
        )}
      </main>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "14px 20px",
        borderRadius: "12px",
        background: "rgba(220,53,69,0.35)",
        border: "1px solid rgba(220,53,69,0.6)",
        fontWeight: 600
      }}
    >
      {message}
    </div>
  );
}

export default App;
