import React, { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const socket = io(API, { autoConnect: true });
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

function App() {
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const [tickets, setTickets] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [myTicket, setMyTicket] = useState(null);
  const [route, setRoute] = useState(location.pathname);
  const [token, setToken] = useState(localStorage.getItem("qf_token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const activeService = useMemo(() => services.find(s => s.id === serviceId), [services, serviceId]);

  async function loadServices() {
    const data = await request("/api/services");
    setServices(data);
    if (!serviceId && data[0]) setServiceId(data[0].id);
  }
  async function loadQueue(id = serviceId) {
    if (!id) return;
    setTickets(await request(`/api/queue/${id}`));
  }

  useEffect(() => { loadServices().catch(e => setNotice(e.message)); }, []);
  useEffect(() => {
    if (!serviceId) return;
    loadQueue(serviceId).catch(e => setNotice(e.message));
    socket.emit("queue:join", serviceId);
    const refresh = () => loadQueue(serviceId).catch(() => {});
    socket.on("queue:updated", refresh);
    return () => { socket.emit("queue:leave", serviceId); socket.off("queue:updated", refresh); };
  }, [serviceId]);

  useEffect(() => {
    const onPop = () => setRoute(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  function navigate(path) {
    history.pushState({}, "", path); setRoute(path); setNotice("");
  }

  async function createTicket(e) {
    e.preventDefault(); setNotice(""); setMyTicket(null);
    try {
      const ticket = await request("/api/tickets", {
        method: "POST", body: JSON.stringify({ serviceId, customerName: name, phone })
      });
      setMyTicket(ticket); setName(""); setPhone("");
      await loadQueue();
    } catch (e) { setNotice(e.message); }
  }

  async function login(e) {
    e.preventDefault();
    try {
      const data = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem("qf_token", data.token); setToken(data.token); setNotice("Signed in successfully.");
    } catch (e) { setNotice(e.message); }
  }
  async function staffAction(path, body) {
    try {
      await request(path, { method: "POST", body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } });
      await loadQueue();
      setNotice("Queue updated.");
    } catch (e) { setNotice(e.message); }
  }

  const waiting = tickets.filter(t => t.status === "waiting");
  const current = tickets.find(t => t.status === "called");
  const board = route === "/board";
  const staff = route === "/staff";

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" onClick={e => {e.preventDefault(); navigate("/");}}><span className="brand-mark">Q</span><span>QueueFlow <b>BD</b></span></a>
      <nav><button className={route === "/" ? "nav active" : "nav"} onClick={() => navigate("/")}>Book token</button><button className={board ? "nav active" : "nav"} onClick={() => navigate("/board")}>Live board</button><button className={staff ? "nav active" : "nav"} onClick={() => navigate("/staff")}>Staff</button></nav>
    </header>

    <main>
      <section className="hero">
        <div><div className="eyebrow"><span className="pulse"></span> SMART QUEUE MANAGEMENT</div>
          <h1>Less waiting.<br/><span>More living.</span></h1>
          <p>Book your token online and follow your turn in real time. Simple, transparent queue management for Bangladesh.</p>
        </div>
        <div className="hero-card"><div className="hero-card-top"><span>NOW SERVING</span><span className="live"><i/> LIVE</span></div><div className="hero-number">{current ? `A-${String(current.ticket_number).padStart(3,"0")}` : "— — —"}</div><div className="hero-foot">{current?.customer_name || "Waiting for the next token"}</div><div className="mini-stats"><div><strong>{waiting.length}</strong><small>Waiting</small></div><div><strong>{tickets.length}</strong><small>Today's tokens</small></div><div><strong>{tickets.filter(t=>t.status==="completed").length}</strong><small>Completed</small></div></div></div>
      </section>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {staff ? <section className="panel staff-panel"><div className="section-heading"><div><div className="eyebrow">TEAM WORKSPACE</div><h2>Staff control</h2></div><span className="tag">AUTHORIZED ACCESS</span></div>
        {!token ? <form className="staff-login" onSubmit={login}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="staff@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Your password"/></label><button className="primary">Sign in</button></form> :
        <div className="staff-actions"><p>Signed in. Select a service on the booking page or use the current service:</p><button className="primary" disabled={!serviceId} onClick={()=>staffAction("/api/staff/next",{serviceId})}>Call next token</button><button className="secondary" onClick={()=>{localStorage.removeItem("qf_token");setToken("");}}>Sign out</button></div>}
      </section> : board ? <section className="panel"><div className="section-heading"><div><div className="eyebrow">LIVE QUEUE</div><h2>Today's queue</h2></div><span className="tag"><i className="green-dot"/> AUTO UPDATING</span></div>
        <div className="service-select"><label>Service<select value={serviceId} onChange={e=>setServiceId(e.target.value)}>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
        <div className="queue-columns"><div><h3>Now serving</h3>{current ? <div className="serving-ticket"><b>A-{String(current.ticket_number).padStart(3,"0")}</b><span>{current.customer_name}</span></div> : <div className="empty">No token is being served</div>}</div><div><h3>Waiting ({waiting.length})</h3><div className="waiting-list">{waiting.length ? waiting.map(t=><div className="waiting-row" key={t.id}><b>A-{String(t.ticket_number).padStart(3,"0")}</b><span>{t.customer_name}</span><small>Waiting</small></div>) : <div className="empty">No one is waiting</div>}</div></div></div>
      </section> : <section className="content-grid">
        <div className="panel booking-panel"><div className="eyebrow">GET YOUR PLACE IN LINE</div><h2>Book a token</h2><p className="muted">Choose a service and enter your details. Your token will be generated instantly.</p>
          <form onSubmit={createTicket}><label>Choose service<select required value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="" disabled>Select a service</option>{services.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>Your name<input required minLength="2" maxLength="80" value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your full name"/></label><label>Phone number <span className="optional">(optional)</span><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="01XXXXXXXXX"/></label><button className="primary full" disabled={!serviceId}>Generate my token <span>→</span></button></form>
          {myTicket && <div className="ticket-result"><small>YOUR TOKEN NUMBER</small><strong>A-{String(myTicket.ticket_number).padStart(3,"0")}</strong><span>{myTicket.customer_name}, your token has been created.</span><button className="text-button" onClick={()=>navigate("/board")}>View live queue →</button></div>}
        </div>
        <div className="side-panel"><div className="side-icon">◷</div><h3>Know before you go</h3><p>Follow the live queue and arrive when your turn is getting close.</p><div className="side-divider"></div><div className="side-line"><span>01</span><div><b>Book online</b><small>Get your digital token</small></div></div><div className="side-line"><span>02</span><div><b>Track your turn</b><small>See the queue update live</small></div></div><div className="side-line"><span>03</span><div><b>Get served</b><small>Visit when your token is called</small></div></div></div>
      </section>}
    </main>
    <footer><span>© 2026 QueueFlow BD</span><span>Designed for smoother service experiences in Bangladesh.</span></footer>
  </div>;
}
export default App;
