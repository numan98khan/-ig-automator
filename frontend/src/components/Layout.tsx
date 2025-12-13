import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Instagram, MessageSquare, BookOpen, LogOut, ChevronDown, Settings, Tags, Menu, X as CloseIcon } from 'lucide-react';

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, currentWorkspace, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const navLinks = [
    { to: '/', label: 'Inbox', icon: MessageSquare, isActive: isActive('/') || isActive('/inbox') },
    { to: '/knowledge', label: 'Knowledge', icon: BookOpen, isActive: isActive('/knowledge') },
    { to: '/categories', label: 'Categories', icon: Tags, isActive: isActive('/categories') },
    { to: '/automations', label: 'Automations', icon: Settings, isActive: isActive('/automations') },
  ];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-2">
            <Instagram className="w-6 h-6 md:w-8 md:h-8 text-purple-600" />
            <div>
              <h1 className="text-sm md:text-lg font-bold text-gray-900">AI Instagram Inbox</h1>
              {currentWorkspace && (
                <p className="text-xs text-gray-600 hidden md:block">{currentWorkspace.name}</p>
              )}
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <nav className="flex space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                    link.isActive
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Desktop User Menu */}
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

          {/* Mobile Menu Button and User Avatar */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="p-1 rounded-full hover:bg-gray-100 transition"
            >
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            </button>
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 rounded-lg hover:bg-gray-100 transition"
            >
              {showMobileMenu ? (
                <CloseIcon className="w-6 h-6 text-gray-700" />
              ) : (
                <Menu className="w-6 h-6 text-gray-700" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="fixed top-[60px] right-0 bottom-0 w-64 bg-white shadow-xl z-40 md:hidden">
            <nav className="p-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setShowMobileMenu(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                    link.isActive
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              ))}
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </nav>
          </div>
        </>
      )}

      {/* Mobile User Menu */}
      {showUserMenu && (
        <>
          <div
            className="fixed inset-0 z-10 md:hidden"
            onClick={() => setShowUserMenu(false)}
          />
          <div className="absolute top-16 right-4 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 md:hidden">
            <div className="px-4 py-2 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
              {currentWorkspace && (
                <p className="text-xs text-gray-500">{currentWorkspace.name}</p>
              )}
            </div>
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
