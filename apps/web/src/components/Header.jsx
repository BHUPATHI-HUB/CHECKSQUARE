
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { useChatContext } from '@/contexts/ChatContext.jsx';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, Home, LogOut, User, Shield, Settings, MessageCircle, CheckSquare, Users as UsersIcon } from 'lucide-react';

const Header = () => {
  const { user, logout, isAuthenticated, role } = useAuth();
  const { settings } = useSettings();
  const { unreadCount } = useChatContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path) => location.pathname === path;

  const NavLinks = ({ mobile = false }) => (
    <>
      <Link
        to="/"
        className={`${
          isActive('/') ? 'text-primary font-medium' : 'text-foreground hover:text-primary'
        } transition-colors duration-200 ${mobile ? 'block py-2' : ''}`}
        onClick={() => mobile && setMobileOpen(false)}
      >
        Home
      </Link>
      {isAuthenticated && (
        <Link
          to={role === 'admin' ? '/admin/dashboard' : role === 'inspector' ? '/inspector/dashboard' : '/customer'}
          className={`${
            location.pathname.includes('dashboard') || location.pathname === '/customer' ? 'text-primary font-medium' : 'text-foreground hover:text-primary'
          } transition-colors duration-200 ${mobile ? 'block py-2' : ''}`}
          onClick={() => mobile && setMobileOpen(false)}
        >
          Dashboard
        </Link>
      )}
      {isAuthenticated && role === 'admin' && (
        <>
          <Link
            to="/admin/users"
            className={`${
              isActive('/admin/users') ? 'text-primary font-medium' : 'text-foreground hover:text-primary'
            } transition-colors duration-200 ${mobile ? 'block py-2' : ''}`}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Users
          </Link>
          <Link
            to="/admin/settings"
            className={`${
              isActive('/admin/settings') ? 'text-primary font-medium' : 'text-foreground hover:text-primary'
            } transition-colors duration-200 ${mobile ? 'block py-2' : ''}`}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Settings
          </Link>
        </>
      )}
    </>
  );

  if (!settings) return null;

  const displayLogo = settings.customLogo || settings.logo || '/logo.svg';
  const displayAppName = settings.appName || 'CheckSquare';
  const [logoBroken, setLogoBroken] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2">
          <div className="flex items-center gap-8 min-w-0 flex-1">
            <Link to="/" className="flex items-center gap-2 min-w-0">
              {displayLogo && !logoBroken ? (
                <img
                  src={displayLogo}
                  alt={displayAppName}
                  className="h-10 max-w-[120px] object-contain flex-shrink-0"
                  onError={() => setLogoBroken(true)}
                />
              ) : (
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckSquare className="w-5 h-5 text-primary-foreground" />
                </div>
              )}
              <span className="font-bold text-lg sm:text-xl text-primary tracking-tight truncate">{displayAppName}</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-6">
              <NavLinks />
            </nav>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="icon" asChild className="relative hidden md:flex">
                  <Link to="/chat">
                    <MessageCircle className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 badge-unread">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                </Button>

                <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium">
                  {role === 'admin' ? (
                    <Shield className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  <span className="capitalize">{role}</span>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="hidden md:flex items-center gap-2 hover:bg-muted">
                      <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
                        <span className="text-primary font-semibold text-sm">
                          {user?.name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{user?.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span className="font-medium">{user?.name}</span>
                        <span className="text-sm text-muted-foreground">{user?.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {role === 'admin' && (
                      <>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link to="/admin/users">
                            <UsersIcon className="w-4 h-4 mr-2" />
                            Users
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link to="/admin/settings">
                            <Settings className="w-4 h-4 mr-2" />
                            Settings
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-3">
                <Button variant="ghost" asChild>
                  <Link to="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link to="/signup">Sign up</Link>
                </Button>
              </div>
            )}

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative md:hidden"
                  aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={mobileOpen}
                  aria-controls="mobile-nav-sheet"
                >
                  <Menu className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-background"></span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" id="mobile-nav-sheet">
                <SheetHeader className="text-left mb-6">
                  <SheetTitle>{displayAppName}</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-4">
                  <NavLinks mobile />
                  {isAuthenticated ? (
                    <>
                      <Link 
                        to="/chat" 
                        className="flex items-center justify-between py-2 text-foreground hover:text-primary transition-colors"
                        onClick={() => setMobileOpen(false)}
                      >
                        <span className="flex items-center gap-2"><MessageCircle className="w-5 h-5" /> Messages</span>
                        {unreadCount > 0 && <span className="badge-unread">{unreadCount}</span>}
                      </Link>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground mt-4">
                        {role === 'admin' ? (
                          <Shield className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                        <span className="capitalize font-medium">{role}</span>
                      </div>
                      <div className="border-t pt-4">
                        <p className="font-medium mb-1">{user?.name}</p>
                        <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
                        <Button variant="destructive" onClick={handleLogout} className="w-full">
                          <LogOut className="w-4 h-4 mr-2" />
                          Logout
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 border-t pt-4">
                      <Button variant="outline" asChild onClick={() => setMobileOpen(false)} className="w-full justify-center">
                        <Link to="/login">Login</Link>
                      </Button>
                      <Button asChild onClick={() => setMobileOpen(false)} className="w-full justify-center">
                        <Link to="/signup">Sign up</Link>
                      </Button>
                    </div>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
