import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Instagram, MessageSquare, BookOpen, LogOut, ChevronDown, Settings, Tags, Menu, X as CloseIcon, AlertCircle, Sun, Moon } from 'lucide-react';
import ProvisionalUserBanner from './ProvisionalUserBanner';
import { Button } from './ui/Button';

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, currentWorkspace, logout } = useAuth();
  const { theme, setTheme } = useTheme();
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
    { to: '/settings', label: 'Settings', icon: Settings, isActive: isActive('/settings') },
    { to: '/escalations', label: 'Human Alerts', icon: AlertCircle, isActive: isActive('/escalations') },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground relative selection:bg-primary/30 transition-colors duration-300">

      {/* Background Gradients (Subtler) */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-50 dark:opacity-100">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] animate-pulse-slow" />
      </div>

      {/* Header */}
      <header className="glass-panel z-20 border-b border-border/50 px-4 md:px-6 py-3 flex-shrink-0 relative">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-sm">
              <Instagram className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm md:text-lg font-bold tracking-tight">AI Inbox</h1>
              {currentWorkspace && (
                <p className="text-xs text-muted-foreground hidden md:block">{currentWorkspace.name}</p>
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
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${link.isActive
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                >
                  <link.icon className={`w-4 h-4 ${link.isActive ? 'text-primary' : ''}`} />
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="h-6 w-px bg-border mx-2" />

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Desktop User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pr-2 py-1 rounded-full hover:bg-muted transition border border-transparent hover:border-border"
              >
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold text-xs">
                  {user?.email?.[0]?.toUpperCase() || user?.instagramUsername?.[0]?.toUpperCase() || 'U'}
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-background border border-border rounded-lg shadow-xl py-1 z-20 animate-fade-in">
                    <div className="px-4 py-3 border-b border-border/50 mb-1">
                      <p className="text-sm font-medium truncate">{user?.email || user?.instagramUsername || 'User'}</p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="w-full justify-start px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-normal h-auto rounded-none"
                      leftIcon={<LogOut className="w-4 h-4" />}
                    >
                      Logout
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button and User Avatar */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="p-1 rounded-full hover:bg-muted transition"
            >
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold text-sm">
                {user?.email?.[0]?.toUpperCase() || user?.instagramUsername?.[0]?.toUpperCase() || 'U'}
              </div>
            </button>
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition"
            >
              {showMobileMenu ? (
                <CloseIcon className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <>
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="fixed top-[60px] right-0 bottom-0 w-64 bg-background border-l border-border z-40 md:hidden animate-slide-up">
            <nav className="p-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setShowMobileMenu(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${link.isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              ))}

              <div className="h-px bg-border/50 my-2" />

              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition font-medium"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>

              <Button
                variant="ghost"
                onClick={() => {
                  setShowMobileMenu(false);
                  handleLogout();
                }}
                className="w-full justify-start px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted font-medium h-auto"
                leftIcon={<LogOut className="w-5 h-5" />}
              >
                Logout
              </Button>
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
          <div className="absolute top-16 right-4 w-56 bg-background border border-border rounded-lg shadow-xl py-1 z-20 md:hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-border/50">
              <p className="text-sm font-medium truncate">{user?.email || user?.instagramUsername || 'User'}</p>
              {currentWorkspace && (
                <p className="text-xs text-muted-foreground mt-0.5">{currentWorkspace.name}</p>
              )}
            </div>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted font-medium h-auto rounded-none"
              leftIcon={<LogOut className="w-4 h-4" />}
            >
              Logout
            </Button>
          </div>
        </>
      )}

      {/* Provisional User Banner */}
      <div className="relative z-10">
        <ProvisionalUserBanner />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto min-h-0 relative z-0 p-4 md:p-6" style={{ background: 'transparent' }}>
        <div className="max-w-7xl mx-auto h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
