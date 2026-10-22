import { AdminLoginForm } from "../login-form";

export const metadata = { title: "Accesso amministrazione" };

export default function AdminLoginPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-3xl font-semibold">Amministrazione</h1>
      <p className="mt-3 text-sm">
        Accesso riservato agli account predisposti.
      </p>
      <AdminLoginForm />
    </main>
  );
}
