import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
      <SignIn
        appearance={{
          elements: {
            card: 'shadow-2xl',
            headerTitle: 'Sign in to RingBack',
          },
        }}
      />
    </main>
  );
}
