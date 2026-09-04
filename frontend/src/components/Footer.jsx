import React from 'react'
import { motion } from "framer-motion";

import { HelpCircle, BookOpen } from "lucide-react";

import { FaGithub, FaXTwitter } from "react-icons/fa6";



const Footer = () => {
  return (
    <footer className="py-10 sm:py-12 px-5 sm:px-6 border-t border-border mt-12 sm:mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-3 group">
            <motion.div
              whileHover={{ rotate: -10, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="relative flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-accent-500 blur-lg opacity-40 group-hover:opacity-60 transition-opacity rounded-xl" />
              <img
                src="/logo.png"
                alt="NullYield Logo"
                className="relative w-10 h-10 object-contain drop-shadow-md"
              />
            </motion.div>
            <div>
              <div className="font-display font-bold text-sm">
                Null<span className="gradient-text">Yield</span>
              </div>
              <div className="text-xs text-text-muted font-mono">
                v1.0 · Sepolia Testnet
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5 text-sm text-text-muted">
            <a
              href="#faqs"
              className="hover:text-accent-400 transition-colors inline-flex items-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4" /> FAQ
            </a>
            <a
              href="https://github.com/your-org/nullyield"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="hover:text-accent-400 transition-colors inline-flex items-center gap-1.5"
            >
              <FaGithub className="w-4 h-4" />
            </a>
            <a
              href="https://docs.zama.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent-400 transition-colors inline-flex items-center gap-1.5"
            >
              <BookOpen className="w-4 h-4" /> Docs
            </a>
            <a
              href="https://x.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent-400 transition-colors inline-flex items-center gap-1.5"
            >
              <FaXTwitter className="w-4 h-4" /> X
            </a>
          </div>

          <div className="text-xs text-text-muted font-mono">
            Built with{" "}
            <a
              href="https://www.zama.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400 hover:text-accent-300"
            >
              Zama FHE
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};


export default Footer