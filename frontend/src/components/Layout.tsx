import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  TestTube,
  LayoutDashboard,
  Search,
  Sparkles,
  Plus,
  Check,
  Moon,
  Sun,
  LifeBuoy,
  Atom,
} from 'lucide-react';
import ProvisionalUserBanner from './ProvisionalUserBanner';
import { Button } from './ui/Button';
import GlobalSearchModal from './GlobalSearchModal';
import { useAccountContext } from '../context/AccountContext';
import useOverlayClose from '../hooks/useOverlayClose';
import { useTheme } from '../context/ThemeContext';
import SupportTicketModal from './SupportTicketModal';
import { recordBreadcrumb } from '../services/diagnostics';
import AssistantWidget from './AssistantWidget';

const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, currentWorkspace, logout } = useAuth();
  const { accounts, activeAccount, setActiveAccount, refreshAccounts } = useAccountContext();
  const { theme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const accountMenuRef = useOverlayClose({ isOpen: accountMenuOpen, onClose: () => setAccountMenuOpen(false) });
  const aiMenuRef = useOverlayClose({ isOpen: aiMenuOpen, onClose: () => setAiMenuOpen(false) });
  const userMenuRef = useOverlayClose({ isOpen: showUserMenu, onClose: () => setShowUserMenu(false) });

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const aiLinks = useMemo(() => ([
    { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
    { to: '/categories', label: 'Categories & Policies', icon: Tags },
    { to: '/sandbox', label: 'Sandbox (Test)', icon: TestTube },
  ]), []);

  const navLinks = useMemo(() => {
    const links = [
      { to: '/inbox', label: 'Inbox', icon: MessageSquare, isActive: isActive('/inbox') || location.pathname === '/' },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: isActive('/dashboard') },
      { to: '/alerts', label: 'Alerts', icon: AlertCircle, isActive: isActive('/alerts') },
      { to: '/automations', label: 'Automations', icon: Atom, isActive: isActive('/automations') },
      { to: '/settings', label: 'Settings', icon: Settings, isActive: isActive('/settings') },
    ];

    return links;
  }, [location.pathname]);

  const aiMenuActive = aiLinks.some((link) => isActive(link.to));
  const connectedAccountLabel = useMemo(() => {
    if (!activeAccount) return null;
    return activeAccount.username ? `@${activeAccount.username}` : 'Connected IG';
  }, [activeAccount]);

  const accountAvatar = useMemo(() => {
    return (activeAccount as any)?.profilePictureUrl || (activeAccount as any)?.avatarUrl || null;
  }, [activeAccount]);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    recordBreadcrumb({ type: 'route', label: location.pathname, meta: { path: location.pathname } });
  }, [location.pathname]);

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

      {/* Topographic / Contour Lines Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-contour-lines" aria-hidden />
        <div
          className="absolute inset-0 bg-[radial-gradient(140%_130%_at_18%_18%,rgba(16,107,163,0.14),transparent_52%)] dark:bg-[radial-gradient(140%_130%_at_18%_18%,rgba(72,175,240,0.12),transparent_48%)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#c7d9e5]/80 via-white/45 to-[#eff3f6]/85 dark:from-[#0e1a22]/85 dark:via-transparent dark:to-[#0c141c]/90"
          aria-hidden
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 bg-background/80 border-b border-border/60 shadow-[0_10px_40px_-24px_rgba(0,0,0,0.45)] flex-shrink-0 h-16">
        <div className="relative w-full mx-auto max-w-[1500px] px-4 md:px-6 h-full grid grid-cols-[auto,1fr,auto] items-center gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted transition dark:bg-white/90 dark:border-white/10"
            >
              <img
                src="/sendfx.png"
                alt="SendFx logo"
                className="h-8 w-auto shrink-0 object-contain"
              />
            </Link>
            <div className="relative" ref={accountMenuRef}>
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-2 md:gap-3 px-2.5 md:px-3 md:pl-1 py-2 rounded-full border border-border bg-card hover:border-primary/50 transition shadow-sm h-10 md:h-12"
                aria-label="Switch Instagram account"
              >
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full border border-border bg-muted flex items-center justify-center overflow-hidden text-foreground">
                  {accountAvatar ? (
                    <img src={accountAvatar} alt="Account avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Instagram className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="hidden md:flex text-left min-w-0 flex-col leading-tight">
                  {/* <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Instagram</p> */}
                  <p className="font-semibold text-sm text-foreground truncate">
                    {connectedAccountLabel || 'Connect account'}
                  </p>
                  {currentWorkspace?.name && (
                    <p className="text-[11px] text-muted-foreground truncate">{currentWorkspace.name}</p>
                  )}
                </div>
                <span className="sr-only">
                  Workspace {currentWorkspace?.name || 'not selected'}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block" />
              </button>

              {accountMenuOpen && (
                <div className="absolute top-14 left-0 w-[320px] bg-background border border-border rounded-xl shadow-2xl z-20 p-3 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Accounts</p>
                      <p className="text-sm text-foreground">Switch Instagram accounts</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{accounts.length} connected</span>
                  </div>
                  {accounts.map((account) => (
                    <button
                      key={account._id}
                      onClick={() => {
                        setActiveAccount(account);
                        setAccountMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition ${activeAccount?._id === account._id
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted text-foreground border border-transparent'
                        }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">@{account.username}</p>
                        <p className="text-xs text-muted-foreground">{account.status === 'connected' ? 'Connected' : 'Mock'}</p>
                      </div>
                      {activeAccount?._id === account._id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-2 h-10"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        navigate('/settings');
                      }}
                      leftIcon={<Plus className="w-4 h-4" />}
                    >
                      Connect another Instagram account
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 justify-center min-w-0">
            <div className="hidden md:flex items-center gap-1 rounded-full border border-border bg-card px-1 py-1 shadow-sm h-12">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 ${link.isActive
                    ? 'bg-primary/10 text-primary shadow-sm rounded-full'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted rounded-full'
                    }`}
                >
                  <link.icon className={`w-4 h-4 ${link.isActive ? 'text-primary' : ''}`} />
                  {link.label}
                </Link>
              ))}
              <div className="relative" ref={aiMenuRef}>
                <button
                  onClick={() => setAiMenuOpen(!aiMenuOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transition ${aiMenuActive
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                >
                  <Sparkles className={`w-4 h-4 ${aiMenuActive ? 'text-primary' : ''}`} />
                  AI
                  <ChevronDown className="w-4 h-4" />
                </button>
                {aiMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-xl shadow-xl py-2 z-20">
                    {aiLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setAiMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition ${isActive(link.to)
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                      >
                        <link.icon className="w-4 h-4" />
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end min-w-0">
            <div className="hidden md:flex items-center gap-1.5">
              <button
                onClick={() => setSearchOpen(true)}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-card hover:border-primary/60 transition text-muted-foreground"
              >
                <Search className="w-4 h-4" />
                <span className="sr-only">Open search</span>
              </button>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-card hover:border-primary/60 transition text-muted-foreground"
                aria-label="Toggle dark mode"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-10 px-2 hidden md:inline-flex"
              leftIcon={<LifeBuoy className="w-4 h-4" />}
              onClick={() => {
                setSupportOpen(true);
                recordBreadcrumb({ type: 'action', label: 'opened_help' });
              }}
            >
              Help
            </Button>

            <div className="relative hidden md:block" ref={userMenuRef}>
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
                <div className="absolute right-0 mt-2 w-56 bg-background border border-border rounded-lg shadow-xl py-1 z-20 animate-fade-in">
                  <div className="px-4 py-3 border-b border-border/50 mb-1">
                    <p className="text-sm font-medium truncate">{user?.email || user?.instagramUsername || 'User'}</p>
                    {user?.tier?.name && (
                      <p className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-md">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        {user.tier.name} plan
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowUserMenu(false);
                      setSupportOpen(true);
                      recordBreadcrumb({ type: 'action', label: 'report_issue_dropdown' });
                    }}
                    className="w-full justify-start px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-normal h-auto rounded-none"
                    leftIcon={<LifeBuoy className="w-4 h-4" />}
                  >
                    Report issue
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate('/settings');
                    }}
                    className="w-full justify-start px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-normal h-auto rounded-none"
                    leftIcon={<Settings className="w-4 h-4" />}
                  >
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleLogout}
                    className="w-full justify-start px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-normal h-auto rounded-none"
                    leftIcon={<LogOut className="w-4 h-4" />}
                  >
                    Logout
                  </Button>
                </div>
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
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${link.isActive
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
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${isActive(link.to)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                  >
                    <link.icon className="w-5 h-5" />
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border bg-card shadow-sm">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">Appearance</span>
                      <span className="text-xs text-muted-foreground">{theme === 'dark' ? 'Dark theme enabled' : 'Light theme enabled'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border border-border transition ${theme === 'dark' ? 'bg-primary/80' : 'bg-muted'}`}
                    aria-label="Toggle theme"
                    aria-pressed={theme === 'dark'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition ${theme === 'dark' ? 'translate-x-5' : 'translate-x-1'}`}
                    />
                  </button>
                </div>

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
              </div>
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
              onClick={() => {
                setShowUserMenu(false);
                setSupportOpen(true);
                recordBreadcrumb({ type: 'action', label: 'report_issue_mobile' });
              }}
              className="w-full justify-start px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted font-medium h-auto rounded-none"
              leftIcon={<LifeBuoy className="w-4 h-4" />}
            >
              Report issue
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowUserMenu(false);
                navigate('/settings');
              }}
              className="w-full justify-start px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted font-medium h-auto rounded-none"
              leftIcon={<Settings className="w-4 h-4" />}
            >
              Settings
            </Button>
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
        <div className="max-w-[1400px] mx-auto h-full">
          <Outlet />
        </div>
      </main>

      <AssistantWidget
        locationHint={location.pathname}
        workspaceName={currentWorkspace?.name}
        workspaceId={currentWorkspace?._id}
      />

      <SupportTicketModal open={supportOpen} onClose={() => setSupportOpen(false)} />
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
