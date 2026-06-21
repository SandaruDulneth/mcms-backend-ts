import mongoose, {  ConnectOptions } from 'mongoose';

const connectDB = async (): Promise<void> => {
  const proc = (globalThis as any).process;
  try {
    const uri = proc?.env?.MONGODB_URI ?? 'mongodb://localhost:27017/mydb';

    const conn = await mongoose.connect(uri, {} as ConnectOptions);

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events (cast to any for compatibility with types)
    (mongoose.connection as any).on('error', (err: Error) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    (mongoose.connection as any).on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    // Graceful shutdown
    proc?.on?.('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      proc?.exit?.(0);
    });

    } catch (error) {
    console.error(`Error connecting to MongoDB: ${(error as Error).message}`);
    proc?.exit?.(1);
  }
};

export default connectDB;