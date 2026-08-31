import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">Relay</h1>
      <p className="mt-4 text-lg">
        The Co-Founder you always wished to have
      </p>
      <div className="mt-8 space-y-4">
        <Link to="/research" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Start Research
        </Link>
        <Link to="/analyze" className="inline-block px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 ml-4">
          Analyze Startup Idea
        </Link>
      </div>
    </div>
  )
}
