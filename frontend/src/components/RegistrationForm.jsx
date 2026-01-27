
const RegistrationForm = ({ onSwitchToLogin }) => (
  <div style={{ padding: 20 }}>
    <h3>Registration removed</h3>
    <p>Account creation is disabled in public-only mode.</p>
    {onSwitchToLogin && <button onClick={() => onSwitchToLogin()}>Back</button>}
  </div>
);

export default RegistrationForm;