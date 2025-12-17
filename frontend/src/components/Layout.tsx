import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { instagramAPI, InstagramAccount, Workspace } from '../services/api';
import {
  Instagram,
  MessageSquare,
  BookOpen,
  LogOut,
  ChevronDown,
  Settings,
  Tags,
  Menu,
  X as CloseIcon,
  AlertCircle,
  Sun,
  Moon,
  TestTube,
  LayoutDashboard,
  Search,
  Plus,
  Users,
  Sparkles,
} from 'lucide-react';
import ProvisionalUserBanner from './ProvisionalUserBanner';
import { Button } from './ui/Button';
import GlobalSearchModal from './GlobalSearchModal';

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, currentWorkspace, workspaces, setCurrentWorkspace, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const aiLinks = useMemo(() => ([
    { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
    { to: '/categories', label: 'Categories & Policies', icon: Tags },
    { to: '/sandbox', label: 'Sandbox (Test)', icon: TestTube },
  ]), []);

  const navLinks = useMemo(() => ([
    { to: '/inbox', label: 'Inbox', icon: MessageSquare, isActive: isActive('/inbox') || location.pathname === '/' },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: isActive('/dashboard') },
    { to: '/alerts', label: 'Alerts', icon: AlertCircle, isActive: isActive('/alerts') },
    { to: '/team', label: 'Team', icon: Users, isActive: isActive('/team') },
    { to: '/settings', label: 'Settings', icon: Settings, isActive: isActive('/settings') },
  ]), [location.pathname]);

  const aiMenuActive = aiLinks.some((link) => isActive(link.to));
  const primaryAccount = useMemo(() => accounts.find((acc) => acc.status === 'connected') || accounts[0], [accounts]);
  const connectedAccountLabel = useMemo(() => {
    if (!primaryAccount) return null;
    const suffix = accounts.length > 1 ? ` +${accounts.length - 1}` : '';
    const username = primaryAccount.username ? `@${primaryAccount.username}` : 'Connected IG';
    return `${username}${suffix}`;
  }, [accounts.length, primaryAccount]);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    setWorkspaceMenuOpen(false);
    navigate('/dashboard');
  };

  useEffect(() => {
    if (!currentWorkspace) {
      setAccounts([]);
      return;
    }

    instagramAPI
      .getByWorkspace(currentWorkspace._id)
      .then((data) => setAccounts(data || []))
      .catch((error) => console.error('Failed to load Instagram accounts', error));
  }, [currentWorkspace]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground relative selection:bg-primary/30 transition-colors duration-300">

      {/* Background Gradients (Subtler) */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-50 dark:opacity-100">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[120px] animate-pulse-slow" />
      </div>

      {/* Header */}
      <header className="glass-panel sticky top-0 z-20 border-b border-border/50 px-4 md:px-6 py-3 flex-shrink-0 relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/50 transition shadow-sm"
            >
              <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-sm">
                <Instagram className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Workspace</p>
                <p className="text-sm font-semibold truncate">{currentWorkspace?.name || 'Select workspace'}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>

            {workspaceMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setWorkspaceMenuOpen(false)}
                />
                <div className="absolute top-[64px] left-4 w-72 bg-background border border-border rounded-xl shadow-xl z-20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground px-1">Switch workspace</p>
                  {workspaces.map((workspace) => (
                    <button
                      key={workspace._id}
                      onClick={() => handleWorkspaceSelect(workspace)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition ${
                        currentWorkspace?._id === workspace._id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <span className="truncate">{workspace.name}</span>
                      {currentWorkspace?._id === workspace._id && (
                        <span className="text-[11px] font-semibold">Current</span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-2 h-10"
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        navigate('/settings');
                      }}
                    >
                      Manage accounts
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-2 h-10"
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        navigate('/settings');
                      }}
                    >
                      Add Instagram account
                    </Button>
                  </div>
                </div>
              </>
            )}

            {connectedAccountLabel && (
              <div className="relative">
                <button
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border bg-background/70 hover:border-primary/60 transition text-sm"
                >
                  <span className="text-muted-foreground text-xs">Connected</span>
                  <span className="font-semibold">{connectedAccountLabel}</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                {accountMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setAccountMenuOpen(false)}
                    />
                    <div className="absolute top-12 left-0 w-72 bg-background border border-border rounded-xl shadow-xl z-20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground px-1">Connected Instagram accounts</p>
                      {accounts.map((account) => (
                        <div
                          key={account._id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 text-sm"
                        >
                          <div>
                            <p className="font-semibold">@{account.username}</p>
                            <p className="text-xs text-muted-foreground">{account.status}</p>
                          </div>
                          <span className="px-2 py-1 rounded-full text-[11px] bg-primary/10 text-primary">Switch</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="hidden md:flex items-center gap-1 rounded-xl border border-border bg-card px-1 py-1 shadow-sm">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    link.isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <link.icon className={`w-4 h-4 ${link.isActive ? 'text-primary' : ''}`} />
                  {link.label}
                </Link>
              ))}
              <div className="relative">
                <button
                  onClick={() => setAiMenuOpen(!aiMenuOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                    aiMenuActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 ${aiMenuActive ? 'text-primary' : ''}`} />
                  AI
                  <ChevronDown className="w-4 h-4" />
                </button>
                {aiMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setAiMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-xl shadow-xl py-2 z-20">
                      {aiLinks.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          onClick={() => setAiMenuOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition ${
                            isActive(link.to)
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          <link.icon className="w-4 h-4" />
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/60 transition text-sm text-muted-foreground"
            >
              <Search className="w-4 h-4" />
              Search
              <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">⌘ K</span>
            </button>

            <div className="relative">
              <Button
                onClick={() => setCreateMenuOpen(!createMenuOpen)}
                className="hidden md:inline-flex items-center gap-2"
                leftIcon={<Plus className="w-4 h-4" />}
              >
                New
              </Button>
              {createMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setCreateMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-60 bg-background border border-border rounded-xl shadow-xl py-2 z-20">
                    <Link
                      to="/knowledge"
                      onClick={() => setCreateMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition"
                    >
                      <BookOpen className="w-4 h-4 text-primary" />
                      New knowledge item
                    </Link>
                    <Link
                      to="/sandbox"
                      onClick={() => setCreateMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition"
                    >
                      <TestTube className="w-4 h-4 text-primary" />
                      New sandbox scenario
                    </Link>
                    <Link
                      to="/team"
                      onClick={() => setCreateMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition"
                    >
                      <Users className="w-4 h-4 text-primary" />
                      Invite teammate
                    </Link>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative hidden md:block">
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

            {/* Mobile toggles */}
            <div className="flex md:hidden items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition"
              >
                <Search className="w-5 h-5" />
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
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <>
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="fixed top-[60px] right-0 bottom-0 w-72 bg-background border-l border-border z-40 md:hidden animate-slide-up overflow-y-auto">
            <nav className="p-4 space-y-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Main</p>
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setShowMobileMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                      link.isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <link.icon className="w-5 h-5" />
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="space-y-1 pt-3 border-t border-border/50">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">AI</p>
                {aiLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setShowMobileMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                      isActive(link.to)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <link.icon className="w-5 h-5" />
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="h-px bg-border/50 my-2" />

              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition font-medium"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}<span className="flex-1 text-left">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
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

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(path) => {
          setSearchOpen(false);
          navigate(path);
        }}
      />
    </div>
  );
};

export default Layout;
