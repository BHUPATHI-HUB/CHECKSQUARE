
import React from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { CheckSquare } from 'lucide-react';

const Footer = () => {
  const { settings } = useSettings();

  if (!settings) return null;

  const displayLogo = settings.customLogo || settings.logo;
  const displayAppName = settings.appName || 'CheckSquare';

  return (
    <footer className="border-t bg-muted/30 pt-12 pb-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              {displayLogo ? (
                <img src={displayLogo} alt={displayAppName} className="h-8 object-contain" />
              ) : (
                <>
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <CheckSquare className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <span className="font-bold text-xl">{displayAppName}</span>
                </>
              )}
            </div>
            <p className="text-muted-foreground text-sm max-w-sm">
              {settings.footer}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Contact Info</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{settings.companyName}</p>
              <p>{settings.address}</p>
              <p>{settings.phone}</p>
              <p>{settings.email}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Legal</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <Link to="/privacy" className="block hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link to="/terms"   className="block hover:text-foreground transition-colors">Terms of Service</Link>
              <Link to="/about"   className="block hover:text-foreground transition-colors">About</Link>
            </div>
          </div>
        </div>

        <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} {settings.companyName}. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
