import { Link } from "react-router-dom";

function Navbar({ user, onLogout }) {
  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur px-6 py-4 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div>
          <Link to="/" className="text-xl font-bold">
            VisionAI
          </Link>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/dashboard" className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/15">
            Dashboard
          </Link>
          <Link to="/profile" className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/15">
            Profile
          </Link>
          {user ? (
            <button onClick={onLogout} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500">
              Logout
            </button>
          ) : (
            <Link to="/login" className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500">
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
