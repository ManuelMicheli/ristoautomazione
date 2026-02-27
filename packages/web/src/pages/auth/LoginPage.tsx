import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, ApiError } from '@/services/api-client';
import type { LoginResponse } from '@/types';
import { cn } from '@/utils/cn';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email obbligatoria')
    .email('Inserisci un indirizzo email valido'),
  password: z
    .string()
    .min(1, 'Password obbligatoria')
    .min(6, 'La password deve avere almeno 6 caratteri'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      const response = await apiClient.post<LoginResponse>('/auth/login', data);
      const { user, tokens } = response.data;
      login(user, tokens.accessToken, tokens.refreshToken);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError('Errore di connessione. Riprova piu tardi.');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-green/10">
            <ShieldCheck className="h-8 w-8 text-accent-green" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Central Procurement Hub
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Accedi al sistema di gestione acquisti
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Server error */}
            {serverError && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {serverError}
              </div>
            )}

            {/* Email field */}
            <div className="mb-5">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nome@azienda.it"
                className={cn(
                  'w-full rounded-lg border bg-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500',
                  'outline-none transition-all duration-200',
                  'focus:border-accent-green focus:ring-2 focus:ring-accent-green/20',
                  errors.email
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-600'
                )}
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password field */}
            <div className="mb-6">
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Inserisci la password"
                className={cn(
                  'w-full rounded-lg border bg-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500',
                  'outline-none transition-all duration-200',
                  'focus:border-accent-green focus:ring-2 focus:ring-accent-green/20',
                  errors.password
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-600'
                )}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold',
                'transition-all duration-200',
                isSubmitting
                  ? 'cursor-not-allowed bg-accent-green/50 text-white/70'
                  : 'bg-accent-green text-white hover:bg-accent-green/90 active:scale-[0.98]'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                'Accedi'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          CPH v0.1.0 — Central Procurement Hub
        </p>
      </div>
    </div>
  );
}
