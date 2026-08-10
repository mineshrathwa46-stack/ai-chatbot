function Profile({ user }) {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-8 shadow-2xl text-center">
        <h1 className="text-3xl font-bold">Profile</h1>
        <div className="mt-6 space-y-4">
          <p className="text-sm text-slate-300">Name: {user?.name}</p>
          <p className="text-sm text-slate-300">Email: {user?.email}</p>
          {user?.picture && (
            <img src={user.picture} alt={user.name} className="mx-auto mt-4 h-24 w-24 rounded-full" />
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;
