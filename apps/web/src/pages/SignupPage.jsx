import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowRight, User, Phone, Mail, Lock, AlertCircle, CheckSquare } from 'lucide-react';

const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } };

const Field = ({ id, label, icon: Icon, error, children }) => (
  <div>
    <Label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</Label>
    <div className="relative mt-2">
      <Icon className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
      {children}
    </div>
    {error && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
  </div>
);

const SignupPage = () => {
  const { signup } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', password: '', confirmPassword: '', role: 'inspector',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const brand = settings?.appName || 'CheckSquare';

  const validate = () => {
    const e = {};
    if (!formData.name) e.name = 'Name is required';
    if (!formData.phone) e.phone = 'Phone number is required';
    if (!formData.email) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = 'Email is invalid';
    if (!formData.password) e.password = 'Password is required';
    else if (formData.password.length < 6) e.password = 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
    setLoading(true); setErrors({});
    const result = signup(formData.name, formData.phone, formData.email, formData.password, formData.role);
    setLoading(false);
    if (result.success) { toast.success('Account created successfully'); navigate('/login'); }
    else { setErrors({ submit: result.error }); toast.error(result.error); }
  };

  return (
    <>
      <Helmet><title>Join the studio — {brand}</title></Helmet>

      <div className="auth-shell">
        <div className="auth-form-col">
          <motion.div {...fadeUp} className="mb-12">
            <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl tracking-tight">
              <CheckSquare className="w-7 h-7 text-primary" strokeWidth={2.25} />
              <span className="text-primary">{brand}</span>
            </Link>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }} className="flex-1 flex flex-col justify-center max-w-md">
            <p className="editorial-eyebrow">Staff registration</p>
            <h1 className="editorial-headline mt-5 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">Join the studio.</h1>
            <p className="editorial-deck mt-4 text-base md:text-lg">
              For inspectors and administrators. Homeowners should{' '}
              <Link to="/customer-signup" className="text-foreground font-semibold link-underline">book here</Link>.
            </p>

            <form onSubmit={handleSubmit} className="mt-10 space-y-6">
              <Field id="name" label="Full name" icon={User} error={errors.name}>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Maya Chen" className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent" />
              </Field>
              <Field id="phone" label="Phone" icon={Phone} error={errors.phone}>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 555 0100" className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent" />
              </Field>
              <Field id="email" label="Email" icon={Mail} error={errors.email}>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="you@studio.com" className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent" />
              </Field>

              <div className="grid grid-cols-2 gap-6">
                <Field id="password" label="Password" icon={Lock} error={errors.password}>
                  <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent" />
                </Field>
                <Field id="confirmPassword" label="Confirm" icon={Lock} error={errors.confirmPassword}>
                  <Input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="h-12 pl-8 pr-0 border-0 border-b rounded-none focus-visible:ring-0 text-base bg-transparent" />
                </Field>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Role</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger className="mt-2 h-12 border-0 border-b rounded-none px-0 focus:ring-0 text-base font-medium bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inspector">Inspector</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {errors.submit && (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-4 py-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{errors.submit}
                </div>
              )}

              <Button type="submit" disabled={loading} size="lg" className="w-full h-14 rounded-none text-base mt-4 group">
                {loading ? 'Creating account…' : <>Create account <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>}
              </Button>
            </form>

            <p className="mt-10 text-sm text-muted-foreground">
              Already registered?{' '}
              <Link to="/login" className="text-foreground font-semibold link-underline">Sign in</Link>
            </p>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="mt-12 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand}. <Link to="/privacy" className="link-underline">Privacy</Link> · <Link to="/terms" className="link-underline">Terms</Link>
          </motion.div>
        </div>

        <aside className="auth-aside">
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1400&q=80" alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary via-primary/95 to-primary/70" />
          </div>
          <div className="relative h-full flex flex-col justify-between p-16 z-10">
            <p className="editorial-eyebrow text-secondary">For practitioners</p>
            <div>
              <h2 className="editorial-headline text-primary-foreground text-4xl xl:text-5xl 2xl:text-6xl max-w-md">
                Tools that respect <em>how the trade actually works.</em>
              </h2>
              <p className="text-primary-foreground/70 mt-8 max-w-md leading-relaxed">
                Five-phase workflow. Photo-first defect logging. Senior review baked in. Field-tested by
                inspectors with more than a decade in the work.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default SignupPage;
