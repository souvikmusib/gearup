import Link from 'next/link';
import { Wrench, Search, Clock, Shield } from 'lucide-react';

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 py-20">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
            Professional Motorcycle Servicing<br />You Can <span className="text-blue-600">Trust</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            Book your bike service online, track progress in real-time, and get your ride back on the road — hassle-free.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/book-service" className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700">
              Book a Service
            </Link>
            <Link href="/track" className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
              Track Your Request
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white">Our Services</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {['General Service', 'Engine Repair', 'Brake & Clutch', 'Electrical & Wiring', 'Chain & Sprocket', 'Body & Paint', 'Tyre & Wheel Alignment', 'Diagnostics'].map((s) => (
              <div key={s} className="rounded-lg border border-gray-200 bg-white p-5 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <Wrench className="mx-auto mb-3 text-blue-600" size={28} />
                <h3 className="font-semibold text-gray-900 dark:text-white">{s}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white">How It Works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { icon: <Wrench size={24} />, title: '1. Book Online', desc: 'Fill in your bike details and choose a convenient slot.' },
              { icon: <Clock size={24} />, title: '2. Get Serviced', desc: 'Our team inspects, diagnoses, and services your motorcycle.' },
              { icon: <Search size={24} />, title: '3. Track & Collect', desc: 'Track progress online and pick up when ready.' },
            ].map((step) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300">{step.icon}</div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <Shield className="mx-auto mb-4 text-green-600" size={36} />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Trusted by Bike Owners</h2>
          <p className="mx-auto mt-2 max-w-xl text-gray-600 dark:text-gray-400">
            Transparent pricing, real-time updates, and quality workmanship. No surprises.
          </p>
        </div>
      </section>
    </>
  );
}
