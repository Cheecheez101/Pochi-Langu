import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { PageHeader } from '../components/ui/PageHeader';
import { isValidKenyanPhone, isValidPassword, MIN_PASSWORD_LENGTH } from '../auth/validation';

export function LoginPage(): JSX.Element {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setFormError('');
    if (!isValidKenyanPhone(phone)) {
      setFormError('Use a valid Kenyan mobile number, such as 0712 345 678.');
      return;
    }
    if (!isValidPassword(password)) {
      setFormError(`Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters.`);
      return;
    }
    setIsSubmitting(true);
    try { await login(phone, password); navigate(destination, { replace: true }); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to sign in.'); }
    finally { setIsSubmitting(false); }
  };
  return <main className="auth-shell"><Card className="auth-card"><PageHeader eyebrow="Welcome back" title="Sign in" description="Continue to your Pochi Langu account." />
    {formError || error ? <Alert>{formError || error}</Alert> : null}
    <form onSubmit={submit}><FormField label="Kenyan mobile number" name="phone" inputProps={{ type: 'tel', value: phone, onChange: (e) => setPhone(e.target.value), required: true, autoComplete: 'tel', placeholder: '0712 345 678' }} /><FormField label="Password" name="password" hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`} inputProps={{ type: 'password', value: password, onChange: (e) => setPassword(e.target.value), required: true, minLength: MIN_PASSWORD_LENGTH, maxLength: 128, autoComplete: 'current-password' }} /><Button type="submit" isLoading={isSubmitting}>Sign in</Button></form>
    <p className="auth-footer"><Link to="/recover">Forgot your password?</Link></p>
    <p className="auth-footer">New to Pochi Langu? <Link to="/register">Create an account</Link></p>
  </Card></main>;
}
