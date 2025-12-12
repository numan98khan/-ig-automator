import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Instagram, MessageSquare, BookOpen, LogOut, ChevronDown } from 'lucide-react';

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, currentWorkspace, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Instagram className="w-8 h-8 text-purple-600" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">AI Instagram Inbox</h1>
                {currentWorkspace && (
                  <p className="text-xs text-gray-600">{currentWorkspace.name}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <nav className="flex space-x-1">
              <Link
                to="/"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${isActive('/') || isActive('/inbox')
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <MessageSquare className="w-4 h-4" />
                Inbox
              </Link>
              <Link
                to="/knowledge"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${isActive('/knowledge')
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <BookOpen className="w-4 h-4" />
                Knowledge
              </Link>
            </nav>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="text-sm font-medium text-gray-700">{user?.email}</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
