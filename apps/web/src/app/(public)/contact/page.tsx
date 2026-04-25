import { Phone, Mail, MapPin, Clock } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contact Us</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">We&apos;re here to help with your vehicle servicing needs.</p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <Phone className="mt-1 text-blue-600" size={20} />
            <div><p className="font-medium text-gray-900 dark:text-white">Phone</p><p className="text-sm text-gray-600 dark:text-gray-400">+91-XXXXXXXXXX</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-1 text-blue-600" size={20} />
            <div><p className="font-medium text-gray-900 dark:text-white">Email</p><p className="text-sm text-gray-600 dark:text-gray-400">info@gearupservicing.com</p></div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 text-blue-600" size={20} />
            <div><p className="font-medium text-gray-900 dark:text-white">Address</p><p className="text-sm text-gray-600 dark:text-gray-400">GearUp Servicing Center</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="mt-1 text-blue-600" size={20} />
            <div><p className="font-medium text-gray-900 dark:text-white">Working Hours</p><p className="text-sm text-gray-600 dark:text-gray-400">Mon–Sat: 9:00 AM – 6:00 PM</p><p className="text-sm text-gray-600 dark:text-gray-400">Sunday: Closed</p></div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
          <MapPin className="mb-3 text-blue-600" size={32} />
          <p className="font-semibold text-gray-900 dark:text-white">Visit Our Service Center</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Book a service request first so the team can confirm bay availability and share exact directions.
          </p>
          <a
            href="/book-service"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Book Service
          </a>
        </div>
      </div>
    </div>
  );
}
