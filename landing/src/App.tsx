import Nav from './components/Nav.tsx'
import Hero from './components/Hero.tsx'
import Features from './components/Features.tsx'
import Footer from './components/Footer.tsx'

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
      </main>
      <Footer />
    </>
  )
}
