import { Link } from 'react-router-dom'

export function TrainScreen() {
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="display">Train</h1>
          <p className="sub">Your active programme, sessions and stopwatch</p>
        </div>
      </header>
      <div className="empty">
        <h3 className="display">No active programme</h3>
        <p>
          When a programme is active, its sessions appear here as tabs, with the next one marked “Up next”, your
          last weights on every exercise and a Start session button.
        </p>
        <Link to="/clients" className="btn-acc" style={{ textDecoration: 'none' }}>Go to clients</Link>
      </div>
    </div>
  )
}
