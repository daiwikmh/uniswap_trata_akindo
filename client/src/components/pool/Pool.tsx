import React from 'react';
import { LeverageTrading } from '../leverage';
import { Card } from "@/components/ui/card";

const Pool: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <Card className="bg-card">
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-6">Leverage Trading Platform</h1>
          
         
            

          
              <LeverageTrading />
        </div>
      </Card>
    </div>
  );
};

export default Pool;