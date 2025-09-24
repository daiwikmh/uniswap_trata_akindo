import React, { useState } from 'react';
import { LeverageTrading } from '../leverage';
import CoWProtocol from '../cow/CoWProtocol';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Shuffle, Waves } from 'lucide-react';

const Pool: React.FC = () => {
  const [activeTab, setActiveTab] = useState('leverage');

  return (
    <div className="container mx-auto p-6">
      <Card className="bg-card">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Waves className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Trading Platform</h1>
              <p className="text-muted-foreground">Leverage Trading & CoW Protocol Integration</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="leverage" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Leverage Trading
              </TabsTrigger>
              <TabsTrigger value="cow" className="flex items-center gap-2">
                <Shuffle className="w-4 h-4" />
                CoW Protocol
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leverage" className="mt-6">
              <LeverageTrading />
            </TabsContent>

            <TabsContent value="cow" className="mt-6">
              <CoWProtocol />
            </TabsContent>
          </Tabs>
        </div>
      </Card>
    </div>
  );
};

export default Pool;