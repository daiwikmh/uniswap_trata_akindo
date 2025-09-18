// Pool Component - Entry point for leverage trading
import React from 'react';
import { LeverageTrading } from '../leverage';

/**
 * Pool Component
 * Main entry point for the leverage trading interface
 * Accessible via /leverage route
 */
const Pool: React.FC = () => {
  return (
    <div className="w-full">
      <LeverageTrading />
    </div>
  );
};

export default Pool;