import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY
const COLORS = ["#6366f1","#22d3ee","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6"]
const delay = ms => new Promise(r => setTimeout(r, ms))

export default function App() {
  const [holdings, setHoldings] = useState([])
  const [marketData, setMarketData] = useState({})
  const [ticker, setTicker] = useState("")
  const [shares, setShares] = useState("")
  const [costBasis, setCostBasis] = useState("")
  const [loading, setLoading] = useState(false)
  const [dividendPrompt, setDividendPrompt] = useState(null)
  const [dividendInput, setDividendInput] = useState("")
  const [editingDividend, setEditingDividend] = useState(null)
  const [editDividendInput, setEditDividendInput] = useState("")

  useEffect(() => { fetchHoldings() }, [])

  async function fetchHoldings() {
    const { data } = await supabase.from("holdings").select("*")
    if (data) {
      setHoldings(data)
      fetchMarketData(data, {})
    }
  }

  async function fetchMarketData(holdingsList, existingData) {
    const data = { ...existingData }
    const toFetch = holdingsList.filter(h => !data[h.ticker])
    for (let i = 0; i < toFetch.length; i++) {
      const h = toFetch[i]
      try {
        const [quoteRes, profileRes] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/quote?symbol=${h.ticker}&token=${FINNHUB_KEY}`),
          fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${h.ticker}&token=${FINNHUB_KEY}`)
        ])
        const quote = await quoteRes.json()
        const profile = await profileRes.json()
        data[h.ticker] = {
          price: quote.c || 0,
          sector: profile.finnhubIndustry || "Unknown",
        }
        setMarketData({ ...data })
      } catch {
        data[h.ticker] = { price: 0, sector: "Unknown" }
      }
      if (i < toFetch.length - 1) await delay(200)
    }
  }

  async function addHolding() {
    if (!ticker || !shares || !costBasis) return
    setLoading(true)
    const sym = ticker.toUpperCase()
    const { data } = await supabase.from("holdings").insert([{
      ticker: sym,
      shares: parseFloat(shares),
      cost_basis: parseFloat(costBasis),
      annual_dividend: 0
    }]).select()
    if (data) {
      const newHoldings = [...holdings, ...data]
      setHoldings(newHoldings)
      setDividendPrompt(data[0])
      fetchMarketData(newHoldings, marketData)
    }
    setTicker(""); setShares(""); setCostBasis("")
    setLoading(false)
  }

  async function saveDividend() {
    const val = parseFloat(dividendInput) || 0
    await supabase.from("holdings").update({ annual_dividend: val }).eq("id", dividendPrompt.id)
    setHoldings(prev => prev.map(h => h.id === dividendPrompt.id ? { ...h, annual_dividend: val } : h))
    setDividendPrompt(null)
    setDividendInput("")
  }

  async function saveEditDividend() {
    const val = parseFloat(editDividendInput) || 0
    await supabase.from("holdings").update({ annual_dividend: val }).eq("id", editingDividend.id)
    setHoldings(prev => prev.map(h => h.id === editingDividend.id ? { ...h, annual_dividend: val } : h))
    setEditingDividend(null)
    setEditDividendInput("")
  }

  async function removeHolding(id) {
    await supabase.from("holdings").delete().eq("id", id)
    setHoldings(holdings.filter(h => h.id !== id))
  }

  const totalValue = holdings.reduce((sum, h) => sum + (marketData[h.ticker]?.price || 0) * h.shares, 0)
  const totalCost = holdings.reduce((sum, h) => sum + h.cost_basis * h.shares, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0
  const totalDividends = holdings.reduce((sum, h) => sum + (h.annual_dividend || 0) * h.shares, 0)

  const sectorData = holdings.reduce((acc, h) => {
    const sector = marketData[h.ticker]?.sector || null
    const value = (marketData[h.ticker]?.price || 0) * h.shares
    if (sector && value > 0) {
      const existing = acc.find(a => a.name === sector)
      if (existing) existing.value = parseFloat((existing.value + value).toFixed(2))
      else acc.push({ name: sector, value: parseFloat(value.toFixed(2)) })
    }
    return acc
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", color: "#f1f1f1", fontFamily: "sans-serif", padding: "2rem" }}>

      {dividendPrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#1a1a1a", borderRadius: "16px", padding: "2rem", width: "360px", border: "0.5px solid #333" }}>
            <p style={{ fontSize: "16px", fontWeight: "500", margin: "0 0 6px" }}>{dividendPrompt.ticker} added</p>
            <p style={{ fontSize: "13px", color: "#888", margin: "0 0 1.5rem" }}>Enter the annual dividend per share, or skip if it pays no dividend.</p>
            <input
              type="number"
              placeholder="e.g. 1.00"
              value={dividendInput}
              onChange={e => setDividendInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveDividend()}
              autoFocus
              style={{ width: "100%", background: "#2a2a2a", border: "0.5px solid #444", borderRadius: "8px", padding: "10px 14px", color: "#f1f1f1", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveDividend}
                style={{ flex: 1, background: "#6366f1", border: "none", borderRadius: "8px", padding: "10px", color: "#fff", fontSize: "14px", cursor: "pointer" }}>
                Save
              </button>
              <button onClick={() => { setDividendPrompt(null); setDividendInput("") }}
                style={{ flex: 1, background: "transparent", border: "0.5px solid #444", borderRadius: "8px", padding: "10px", color: "#888", fontSize: "14px", cursor: "pointer" }}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDividend && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#1a1a1a", borderRadius: "16px", padding: "2rem", width: "360px", border: "0.5px solid #333" }}>
            <p style={{ fontSize: "16px", fontWeight: "500", margin: "0 0 6px" }}>Edit {editingDividend.ticker} dividend</p>
            <p style={{ fontSize: "13px", color: "#888", margin: "0 0 1.5rem" }}>Update the annual dividend per share.</p>
            <input
              type="number"
              placeholder="e.g. 1.00"
              value={editDividendInput}
              onChange={e => setEditDividendInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveEditDividend()}
              autoFocus
              style={{ width: "100%", background: "#2a2a2a", border: "0.5px solid #444", borderRadius: "8px", padding: "10px 14px", color: "#f1f1f1", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEditDividend}
                style={{ flex: 1, background: "#6366f1", border: "none", borderRadius: "8px", padding: "10px", color: "#fff", fontSize: "14px", cursor: "pointer" }}>
                Save
              </button>
              <button onClick={() => { setEditingDividend(null); setEditDividendInput("") }}
                style={{ flex: 1, background: "transparent", border: "0.5px solid #444", borderRadius: "8px", padding: "10px", color: "#888", fontSize: "14px", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "2rem" }}>Portfolio Tracker</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Portfolio Value", value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: "Total Cost", value: `$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: "Total Gain/Loss", value: `${totalGain >= 0 ? "+" : ""}$${totalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalGainPct.toFixed(2)}%)`, color: totalGain >= 0 ? "#10b981" : "#ef4444" },
          { label: "Annual Dividends", value: `$${totalDividends.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
        ].map((card, i) => (
          <div key={i} style={{ background: "#1a1a1a", borderRadius: "12px", padding: "1.25rem" }}>
            <p style={{ fontSize: "13px", color: "#888", margin: "0 0 6px" }}>{card.label}</p>
            <p style={{ fontSize: "22px", fontWeight: "600", margin: 0, color: card.color || "#f1f1f1" }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: "#1a1a1a", borderRadius: "12px", padding: "1.25rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "16px", fontWeight: "500", marginBottom: "1rem" }}>Add Position</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
          {[
            { placeholder: "Ticker (e.g. AAPL)", value: ticker, setter: setTicker },
            { placeholder: "Shares", value: shares, setter: setShares, type: "number" },
            { placeholder: "Cost Basis per Share", value: costBasis, setter: setCostBasis, type: "number" }
          ].map((input, i) => (
            <input key={i} type={input.type || "text"} placeholder={input.placeholder} value={input.value}
              onChange={e => input.setter(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addHolding()}
              style={{ flex: 1, background: "#2a2a2a", border: "0.5px solid #333", borderRadius: "8px", padding: "10px 14px", color: "#f1f1f1", fontSize: "14px", outline: "none" }}
            />
          ))}
          <button onClick={addHolding} disabled={loading}
            style={{ background: "#6366f1", border: "none", borderRadius: "8px", padding: "10px 20px", color: "#fff", fontSize: "14px", cursor: "pointer", whiteSpace: "nowrap" }}>
            {loading ? "Adding..." : "Add Stock"}
          </button>
        </div>
      </div>

      <div style={{ background: "#1a1a1a", borderRadius: "12px", padding: "1.25rem", marginBottom: "2rem", overflowX: "auto" }}>
        <h2 style={{ fontSize: "16px", fontWeight: "500", marginBottom: "1rem" }}>Holdings</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ color: "#888", textAlign: "left" }}>
              {["Ticker", "Shares", "Cost Basis", "Current Price", "Current Value", "Gain/Loss", "Gain/Loss %", "Annual Div/Share", "Annual Div Total", "Sector", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 12px", borderBottom: "0.5px solid #333" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => {
              const price = marketData[h.ticker]?.price || 0
              const value = price * h.shares
              const gain = value - h.cost_basis * h.shares
              const gainPct = h.cost_basis > 0 ? (gain / (h.cost_basis * h.shares)) * 100 : 0
              const annualDiv = (h.annual_dividend || 0) * h.shares
              return (
                <tr key={h.id} style={{ borderBottom: "0.5px solid #222" }}>
                  <td style={{ padding: "10px 12px", fontWeight: "500" }}>{h.ticker}</td>
                  <td style={{ padding: "10px 12px" }}>{h.shares}</td>
                  <td style={{ padding: "10px 12px" }}>${h.cost_basis.toFixed(2)}</td>
                  <td style={{ padding: "10px 12px" }}>${price.toFixed(2)}</td>
                  <td style={{ padding: "10px 12px" }}>${value.toFixed(2)}</td>
                  <td style={{ padding: "10px 12px", color: gain >= 0 ? "#10b981" : "#ef4444" }}>{gain >= 0 ? "+" : ""}${gain.toFixed(2)}</td>
                  <td style={{ padding: "10px 12px", color: gainPct >= 0 ? "#10b981" : "#ef4444" }}>{gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      onClick={() => { setEditingDividend(h); setEditDividendInput(h.annual_dividend || "") }}
                      style={{ cursor: "pointer", borderBottom: "1px dashed #555", paddingBottom: "1px" }}
                      title="Click to edit"
                    >
                      ${(h.annual_dividend || 0).toFixed(2)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>${annualDiv.toFixed(2)}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{marketData[h.ticker]?.sector || "..."}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button onClick={() => removeHolding(h.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </td>
                </tr>
              )
            })}
            {holdings.length === 0 && (
              <tr><td colSpan={11} style={{ padding: "2rem", textAlign: "center", color: "#555" }}>No holdings yet — add your first stock above</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {sectorData.length > 0 && (
        <div style={{ background: "#1a1a1a", borderRadius: "12px", padding: "1.25rem" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "500", marginBottom: "1rem" }}>Sector Allocation</h2>
          <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {sectorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val) => `$${val.toLocaleString()}`} contentStyle={{ background: "#1a1a1a", border: "0.5px solid #333" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  )
}