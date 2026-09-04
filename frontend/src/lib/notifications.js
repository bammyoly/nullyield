// src/lib/notifications.js

import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// Safely derive APP_URL from .env or fallback to window.location.origin
const RAW_URL =
  import.meta.env.VITE_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
const APP_URL = RAW_URL.replace(/\/+$/, "");

const EMAILED_KEY = "nullyield_emailed_draw_ids";

// Helper to generate wallet-specific storage keys
function getStorageKey(address) {
  if (!address) return "nullyield_notify_email_default";
  return `nullyield_notify_email_${address.toLowerCase()}`;
}

/**
 * Retrieve subscriber email for a specific wallet address
 */
export function getNotifyEmail(address) {
  try {
    if (!address) return "";
    return localStorage.getItem(getStorageKey(address)) || "";
  } catch {
    return "";
  }
}

/**
 * Save subscriber email for a specific wallet address
 */
export function setNotifyEmail(address, email) {
  if (!address || !email) return;
  localStorage.setItem(getStorageKey(address), email.trim());
}

/**
 * Clear subscriber email for a specific wallet address
 */
export function clearNotifyEmail(address) {
  if (!address) return;
  localStorage.removeItem(getStorageKey(address));
}

/**
 * Direct EmailJS trigger
 */
export async function sendWinnerEmail({
  toEmail,
  drawId,
  prizeAmount = "100",
  walletAddress,
}) {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn("[email] EmailJS environment variables are missing");
    return false;
  }
  if (!toEmail || !toEmail.includes("@")) return false;

  const formattedAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : "";

  const templateParams = {
    to_email: toEmail,
    toEmail: toEmail,
    email: toEmail,
    drawId: String(drawId),
    draw_id: String(drawId),
    prizeAmount: String(prizeAmount),
    prize_amount: String(prizeAmount),
    walletAddress: formattedAddress,
    wallet_address: formattedAddress,
    appUrl: APP_URL,
    app_url: APP_URL,
  };

  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, {
      publicKey: PUBLIC_KEY,
    });
    return true;
  } catch (error) {
    console.error("[email] Failed to send email via EmailJS:", error);
    return false;
  }
}

/**
 * Centralized winner check & email trigger per wallet address.
 */
export async function maybeEmailWinner({
  connectedAddress,
  winner,
  drawId,
  prizeAmount = "100",
}) {
  try {
    if (!connectedAddress || !winner) return false;
    if (winner.toLowerCase() !== connectedAddress.toLowerCase()) return false;

    // Retrieve email specifically for THIS winning address
    const email = getNotifyEmail(connectedAddress);
    if (!email) return false;

    // Check duplicate send for this specific draw
    let emailed = [];
    try {
      emailed = JSON.parse(localStorage.getItem(EMAILED_KEY) || "[]");
    } catch {
      emailed = [];
    }

    // Unique key per wallet + drawId so multi-wallet users don't conflict
    const sendKey = `${connectedAddress.toLowerCase()}_${drawId}`;
    if (emailed.includes(sendKey)) return false;

    const success = await sendWinnerEmail({
      toEmail: email,
      drawId,
      prizeAmount,
      walletAddress: connectedAddress,
    });

    if (success) {
      emailed.push(sendKey);
      localStorage.setItem(EMAILED_KEY, JSON.stringify(emailed));
      return true;
    }

    return false;
  } catch (err) {
    console.warn("[email] maybeEmailWinner error:", err?.message);
    return false;
  }
}