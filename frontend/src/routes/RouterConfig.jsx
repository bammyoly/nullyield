import React from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import Pool from '../pages/Pool'
import Draws from '../pages/Draws'
import Faucet from '../pages/Faucet'
import Account from '../pages/Account'

const RouterConfig = () => {
  return (
    <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/pool' element={<Pool />} />
      <Route path='/draws' element={<Draws />} />
      <Route path='/faucet' element={<Faucet />} />
      <Route path='/account' element={<Account />} />
    </Routes>
  )
}

export default RouterConfig