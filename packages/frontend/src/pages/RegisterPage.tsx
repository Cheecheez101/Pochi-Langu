import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { PageHeader } from '../components/ui/PageHeader';
import { isValidKenyanPhone, isValidPassword, MIN_PASSWORD_LENGTH } from '../auth/validation';

export function RegisterPage(): JSX.Element {
  const { register, error } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); const [formError, setFormError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); setFormError(''); if (!isValidKenyanPhone(phone)) { setFormError('Use a valid Kenyan mobile number, such as 0712 345 678.'); return; } if (!isValidPassword(password)) { setFormError(`Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters.`); return; } setIsSubmitting(true); try { await register(displayName, phone, password); navigate('/dashboard', { replace: true }); } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to create your account.'); } finally { setIsSubmitting(false); } };
  return <main className="auth-shell"><Card className="auth-card"><PageHeader eyebrow="Start here" title="Create your account" description="A secure space for your financial journey." />
    {formError || error ? <Alert>{formError || error}</Alert> : null}
    <form onSubmit={submit}><FormField label="Name" name="displayName" inputProps={{ value: displayName, onChange: (e) => setDisplayName(e.target.value), required: true, autoComplete: 'name' }} /><FormField label="Kenyan mobile number" name="phone" inputProps={{ type: 'tel', value: phone, onChange: (e) => setPhone(e.target.value), required: true, autoComplete: 'tel', placeholder: '0712 345 678' }} /><FormField label="Password" name="password" hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`} inputProps={{ type: 'password', value: password, onChange: (e) => setPassword(e.target.value), required: true, minLength: MIN_PASSWORD_LENGTH, maxLength: 128, autoComplete: 'new-password' }} /><Button type="submit" isLoading={isSubmitting}>Create account</Button></form>
    <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
  </Card></main>;
}
