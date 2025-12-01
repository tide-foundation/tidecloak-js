// Demo application for @tidecloak/policy component library
import { PolicyBuilder } from '@tidecloak/policy/react';
import '@tidecloak/policy/style.css';
import './demo.css';

export default function App() {
  return (
    <div className="demo-container">
      <header className="demo-header">
        <h1>@tidecloak/policy</h1>
        <p>Visual Policy Builder Component Library</p>
      </header>
      
      <main className="demo-main">
      </main>
      
      <footer className="demo-footer">
        <p>
          This is a demo app showcasing the @tidecloak/policy component library.
        </p>
      </footer>
    </div>
  );
}
