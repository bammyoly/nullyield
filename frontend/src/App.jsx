import { useState } from 'react'
import RouterConfig from './routes/RouterConfig'
import Navbar from './components/Navbar'
import { Toaster } from "./components/Toaster";
import Footer from './components/Footer';

function App() {

  return (
    <>
      <Navbar />
      <RouterConfig />
      <Footer />
      <Toaster />
    </>
  )
}

export default App
