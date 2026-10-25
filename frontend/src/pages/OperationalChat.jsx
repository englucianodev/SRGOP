import { useData } from '../hooks/useData';
import { PageTitle } from '../components/UI';
import CrewCommunication from '../components/CrewCommunication';

export default function OperationalChat() {
  const { data: crews } = useData('/crews', []);
  return (
    <>
      <PageTitle
        title="Chat operacional"
        description="Troca de informações entre as guarnições em serviço."
      />
      <CrewCommunication crews={crews} />
    </>
  );
}
