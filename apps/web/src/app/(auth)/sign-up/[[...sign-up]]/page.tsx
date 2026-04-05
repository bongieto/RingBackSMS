import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
      <SignUp
        appearance={{
          elements: {
            card: 'shadow-2xl',
          },
        }}
      />
    </main>
  );
}
