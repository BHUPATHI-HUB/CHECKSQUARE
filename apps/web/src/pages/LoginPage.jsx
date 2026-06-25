import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowRight, Mail, Lock, AlertCircle, CheckSquare } from 'lucide-react';
import GoogleSignInButton from '@/components/GoogleSignInButton.jsx';

const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } };

const LoginPage = () => {
  const { login, requestPasswordReset } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  // Customers landing here straight after creating an account get their
  // email pre-filled and a small welcome banner so the flow feels seamless.
  const justRegistered = location.state?.justRegistered === true;
  const prefillEmail = location.state?.email || '';
  const [formData, setFormData] = useState({ email: prefillEmail, password: '', role: 'customer' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const from = location.state?.from?.pathname || null;
  const brand = settings?.appName || 'CheckSquare';

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!formData.email) {
      toast.error('Enter your email above first, then click "Forgot password?"');
      return;
    }
    const result = await requestPasswordReset(formData.email);
    if (result.success) toast.success('Password reset email sent. Check your inbox.');
    else toast.error(result.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }

    setLoading(true);
    setErrors({});
    const result = await login(formData.email, formData.password, formData.role);
    setLoading(false);

    if (result.success) {
      toast.success('Signed in successfully');
      if (from) return navigate(from, { replace: true });
      const path = formData.role === 'admin' ? '/admin/dashboard'
                 : formData.role === 'inspector' ? '/inspector/dashboard' : '/customer';
      navigate(path, { replace: true });
    } else {
      setErrors({ submit: result.error });
      toast.error('Authentication failed');
    }
  };

  return (
    <>
      <Helmet><title>Sign in — {brand}</title></Helmet>

      <div className="auth-shell">
        {/* ───────── Left: form column ───────── */}
        <div className="auth-form-col">
          <motion.div {...fadeUp} className="mb-12">
            <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl tracking-tight">
              <CheckSquare className="w-7 h-7 text-primary" strokeWidth={2.25} />
              <span className="text-primary">{brand}</span>
            </Link>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }} className="flex-1 flex flex-col justify-center max-w-md">
            <p className="editorial-eyebrow">{justRegistered ? 'Account created' : 'Returning client'}</p>
            <h1 className="editorial-headline mt-5 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
              {justRegistered ? 'Sign in to begin.' : 'Welcome back.'}
            </h1>
            <p className="editorial-deck mt-4 text-base md:text-lg">
              {justRegistered
                ? 'Your client file is open. Enter the password you just chose to step into your portal.'
                : 'Sign in to review your report, message your inspector, or book again.'}
            </p>

            {justRegistered && (
              <div className="mt-6 border-l-2 border-secondary pl-4 py-2 bg-secondary/5 text-sm">
                <strong className="text-foreground">Welcome.</strong>
                <span className="text-muted-foreground"> Your email is filled in below — just enter your password.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-12 space-y-7">
              <div>
                <Label htmlFor="role" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">I am a</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger id="role" className="mt-2 h-12 border-0 border-b rounded-none px-0 focus:ring-0 text-base font-medium bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="inspector">Inspector</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="email" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Email address</Label>
                <div className="relative mt-2">
                  <Mail className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    id="email" type="email" placeholder="you@domain.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent"
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
              </div>

              <div>
                <div className="flex justify-between items-baseline">
                  <Label htmlFor="password" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Password</Label>
                  <button onClick={handleForgotPassword} className="text-xs text-muted-foreground hover:text-foreground link-underline">Forgot?</button>
                </div>
                <div className="relative mt-2">
                  <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    id="password" type="password" placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent"
                  />
                </div>
                {errors.password && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.password}</p>}
              </div>

              {errors.submit && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-4 py-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{errors.submit}
                </div>
              )}

              <Button type="submit" disabled={loading} size="lg" className="w-full h-14 rounded-none text-base mt-4 group">
                {loading ? 'Signing in…' : <>Sign in <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>}
              </Button>
            </form>

            {/* OAuth — visible only when VITE_SUPABASE_URL is configured */}
            <div className="mt-6 space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="bg-background px-3">or</span>
                </div>
              </div>
              <GoogleSignInButton />
            </div>

            <p className="mt-10 text-sm text-muted-foreground">
              First time?{' '}
              <Link to="/customer-signup" className="text-foreground font-semibold link-underline">Become a client</Link>
              {' · '}
              <Link to="/signup" className="text-muted-foreground link-underline">Inspector / Admin signup</Link>
            </p>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="mt-12 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand}. <Link to="/privacy" className="link-underline">Privacy</Link> · <Link to="/terms" className="link-underline">Terms</Link>
          </motion.div>
        </div>

        {/* ───────── Right: editorial brand panel ───────── */}
        <aside className="auth-aside">
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80"
              alt=""
              className="w-full h-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary via-primary/95 to-primary/70" />
          </div>
          <div className="relative h-full flex flex-col justify-between p-16 z-10">
            <p className="editorial-eyebrow text-secondary">Issue 06 · Spring 2026</p>
            <div>
              <h2 className="editorial-headline text-primary-foreground text-4xl xl:text-5xl 2xl:text-6xl max-w-md">
                The home, <em>considered.</em>
              </h2>
              <p className="text-primary-foreground/70 mt-8 max-w-md leading-relaxed">
                Every inspection is a record. We keep yours bound, signed, and accessible &mdash; for the life
                of the property.
              </p>
              <div className="mt-12 pt-6 border-t border-primary-foreground/15 grid grid-cols-3 gap-6">
                <div><p className="font-display text-3xl text-primary-foreground">2,847</p><p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/60 mt-2">Reports</p></div>
                <div><p className="font-display text-3xl text-primary-foreground">14yr</p><p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/60 mt-2">Tenure</p></div>
                <div><p className="font-display text-3xl text-primary-foreground">4.96</p><p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/60 mt-2">Rating</p></div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default LoginPage;
