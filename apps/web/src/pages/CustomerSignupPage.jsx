import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowRight, User, Phone, Mail, Lock, AlertCircle, CheckCircle2, CheckSquare,
  Shield, Clock, MessageSquare,
} from 'lucide-react';

const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } };

const Field = ({ id, label, icon: Icon, error, children }) => (
  <div>
    <Label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</Label>
    <div className="relative mt-2">
      {Icon && <Icon className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />}
      {children}
    </div>
    {error && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
  </div>
);

const PasswordMeter = ({ pwd }) => {
  const checks = [
    { ok: pwd.length >= 8, label: '8+ characters' },
    { ok: /[A-Z]/.test(pwd), label: 'Uppercase letter' },
    { ok: /[a-z]/.test(pwd), label: 'Lowercase letter' },
    { ok: /[0-9]/.test(pwd), label: 'Number' },
    { ok: /[^A-Za-z0-9]/.test(pwd), label: 'Special character' },
  ];
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-1.5 transition-colors ${c.ok ? 'text-foreground' : 'text-muted-foreground/60'}`}>
          <CheckCircle2 className={`w-3 h-3 ${c.ok ? 'text-secondary' : 'text-muted-foreground/30'}`} />
          {c.label}
        </li>
      ))}
    </ul>
  );
};

const CustomerSignupPage = () => {
  const { signup } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const brand = settings?.appName || 'CheckSquare';

  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validatePassword = (p) =>
    p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);

  const validate = () => {
    const e = {};
    if (!formData.name) e.name = 'Full name is required';
    if (!formData.email) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = 'Valid email is required';
    if (!formData.phone) e.phone = 'Phone number is required';
    if (!formData.password) e.password = 'Password is required';
    else if (!validatePassword(formData.password)) e.password = 'Strengthen your password (see checklist below)';
    if (formData.password !== formData.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!acceptedTerms) e.terms = 'You must accept the terms and conditions';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
    setLoading(true); setErrors({});
    const userData = { ...formData, role: 'customer' };
    const result = await signup(userData);
    setLoading(false);
    if (result.success) {
      toast.success(`Welcome to ${brand}. Please sign in to continue.`);
      // Route freshly-registered customers to the login screen so they
      // start a clean authenticated session with their new credentials.
      navigate('/login', { state: { email: formData.email, justRegistered: true } });
    } else {
      setErrors({ submit: result.error });
      toast.error(result.error);
    }
  };

  return (
    <>
      <Helmet><title>Become a client — {brand}</title></Helmet>

      <div className="auth-shell">
        <div className="auth-form-col">
          <motion.div {...fadeUp} className="mb-10 sm:mb-12">
            <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl tracking-tight">
              <CheckSquare className="w-7 h-7 text-primary" strokeWidth={2.25} />
              <span className="text-primary">{brand}</span>
            </Link>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }} className="flex-1 flex flex-col justify-center max-w-lg">
            <p className="editorial-eyebrow">Homeowners</p>
            <h1 className="editorial-headline mt-5 text-3xl sm:text-4xl md:text-5xl lg:text-6xl break-words">
              Open your <em>client file.</em>
            </h1>
            <p className="editorial-deck mt-4 text-base md:text-lg">
              Two minutes. Four fields. Once you're in, book a visit, message your inspector,
              and receive your bound report — all from one calm portal.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 sm:mt-10 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field id="name" label="Full name *" icon={User} error={errors.name}>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="John Doe" className="h-12 pl-7 border-0 border-b rounded-none px-0 focus-visible:ring-0 text-base bg-transparent" />
                </Field>
                <Field id="phone" label="Phone *" icon={Phone} error={errors.phone}>
                  <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(555) 123-4567" className="h-12 pl-7 border-0 border-b rounded-none px-0 focus-visible:ring-0 text-base bg-transparent" />
                </Field>
              </div>

              <Field id="email" label="Email *" icon={Mail} error={errors.email}>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="john@example.com" className="h-12 pl-7 border-0 border-b rounded-none px-0 focus-visible:ring-0 text-base bg-transparent" />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field id="password" label="Password *" icon={Lock} error={errors.password}>
                  <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="h-12 pl-7 border-0 border-b rounded-none px-0 focus-visible:ring-0 text-base bg-transparent" />
                </Field>
                <Field id="confirmPassword" label="Confirm *" icon={Lock} error={errors.confirmPassword}>
                  <Input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="h-12 pl-7 border-0 border-b rounded-none px-0 focus-visible:ring-0 text-base bg-transparent" />
                </Field>
              </div>

              <PasswordMeter pwd={formData.password} />

              <p className="text-xs text-muted-foreground pt-2">
                Your property address is collected later, when you book the inspection.
              </p>

              <div className="flex items-start gap-3 pt-3 border-t mt-6">
                <Checkbox id="terms" checked={acceptedTerms} onCheckedChange={setAcceptedTerms} className="mt-1" />
                <label htmlFor="terms" className="text-sm leading-relaxed text-muted-foreground cursor-pointer">
                  I have read and accept the <Link to="/terms" className="text-foreground font-semibold link-underline">Terms of Service</Link>
                  {' '}and <Link to="/privacy" className="text-foreground font-semibold link-underline">Privacy Policy</Link>.
                </label>
              </div>
              {errors.terms && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.terms}</p>}

              {errors.submit && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-4 py-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{errors.submit}
                </div>
              )}

              <Button type="submit" disabled={loading} size="lg" className="w-full h-14 rounded-none text-base mt-4 group">
                {loading ? 'Creating account…' : <>Create account & sign in <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>}
              </Button>
            </form>

            <p className="mt-10 text-sm text-muted-foreground">
              Already a client?{' '}
              <Link to="/login" className="text-foreground font-semibold link-underline">Sign in</Link>
            </p>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="mt-12 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand}. <Link to="/privacy" className="link-underline">Privacy</Link> · <Link to="/terms" className="link-underline">Terms</Link>
          </motion.div>
        </div>

        <aside className="auth-aside">
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1400&q=80" alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary via-primary/95 to-primary/70" />
          </div>
          <div className="relative h-full flex flex-col justify-between p-12 xl:p-16 z-10">
            <p className="editorial-eyebrow text-secondary">Welcome, homeowner</p>

            <div>
              <h2 className="editorial-headline text-primary-foreground text-3xl xl:text-5xl 2xl:text-6xl max-w-md">
                Your property, <em>thoroughly known.</em>
              </h2>

              <ul className="text-primary-foreground/85 mt-10 space-y-5 max-w-md">
                {[
                  { icon: Shield, text: 'A senior inspector reviews every report you receive.' },
                  { icon: Clock, text: 'Bound PDF in your inbox within 24 hours of the visit.' },
                  { icon: MessageSquare, text: 'Real-time chat thread with the inspector for follow-ups.' },
                  { icon: CheckCircle2, text: 'Complimentary re-inspection of any flagged item within 30 days.' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3">
                    <Icon className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>

              <figure className="mt-12 border-l-2 border-secondary/70 pl-5 max-w-md">
                <blockquote className="font-display text-primary-foreground text-lg xl:text-xl leading-snug italic">
                  &ldquo;Calmest property purchase I've ever made. The report read like a letter from a careful friend.&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-xs uppercase tracking-[0.2em] text-primary-foreground/60">
                  Anita R. · second-time client
                </figcaption>
              </figure>
            </div>

            <div className="flex items-center gap-6 text-primary-foreground/70 text-xs uppercase tracking-[0.2em]">
              <span>12 yrs</span>
              <span className="h-px flex-1 bg-primary-foreground/20" />
              <span>4,200 reports</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default CustomerSignupPage;
