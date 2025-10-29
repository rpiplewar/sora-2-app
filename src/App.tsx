import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import './styles/scene-builder.css';
import { Home } from './pages/Home';
import { SceneBuilder } from './pages/SceneBuilder';

function Navigation() {
  const location = useLocation();

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <h1>Sora Video Generator</h1>
      </div>

      <ul className="nav-links">
        <li>
          <Link
            to="/"
            className={location.pathname === '/' ? 'active' : ''}
          >
            Multi-Segment Generator
          </Link>
        </li>
        <li>
          <Link
            to="/scene-builder"
            className={location.pathname === '/scene-builder' ? 'active' : ''}
          >
            Scene Builder
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scene-builder" element={<SceneBuilder />} />
      </Routes>
    </BrowserRouter>
  );
}
